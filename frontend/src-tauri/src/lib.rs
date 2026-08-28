use serde::Serialize;
use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    net::{IpAddr, Ipv4Addr, SocketAddr, TcpListener, TcpStream},
    path::Path,
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager, State};

#[cfg(debug_assertions)]
use std::path::PathBuf;

const READY_TIMEOUT: Duration = Duration::from_secs(25);
const HEALTH_INTERVAL: Duration = Duration::from_millis(125);

#[derive(Clone, Debug, Serialize)]
struct DesktopRuntimeStatus {
    embedded: bool,
    environment: String,
    state: String,
    daemon_url: Option<String>,
    pid: Option<u32>,
    message: Option<String>,
}

impl DesktopRuntimeStatus {
    fn starting(environment: &str) -> Self {
        Self {
            embedded: true,
            environment: environment.to_owned(),
            state: "starting".to_owned(),
            daemon_url: None,
            pid: None,
            message: None,
        }
    }

    fn failed(environment: &str, message: impl Into<String>) -> Self {
        Self {
            embedded: true,
            environment: environment.to_owned(),
            state: "failed".to_owned(),
            daemon_url: None,
            pid: None,
            message: Some(message.into()),
        }
    }
}

struct DaemonSupervisor {
    child: Option<Child>,
    status: DesktopRuntimeStatus,
}

impl DaemonSupervisor {
    fn new() -> Self {
        let environment = if cfg!(debug_assertions) {
            "development"
        } else {
            "production"
        };
        Self {
            child: None,
            status: DesktopRuntimeStatus::starting(environment),
        }
    }

    fn start(&mut self, app: &AppHandle) {
        self.stop();
        let environment = if cfg!(debug_assertions) {
            "development"
        } else {
            "production"
        };
        self.status = DesktopRuntimeStatus::starting(environment);

        if let Err(error) = self.start_inner(app, environment) {
            self.stop();
            self.status = DesktopRuntimeStatus::failed(environment, error);
        }
    }

    fn start_inner(&mut self, app: &AppHandle, environment: &str) -> Result<(), String> {
        let data_dir = app
            .path()
            .app_local_data_dir()
            .map_err(|error| format!("Cannot resolve application data directory: {error}"))?;
        fs::create_dir_all(&data_dir)
            .map_err(|error| format!("Cannot create application data directory: {error}"))?;

        let port = available_loopback_port()?;
        let daemon_url = format!("http://127.0.0.1:{port}");
        let mut command = daemon_command(port, &data_dir)?;
        attach_log_output(&mut command, &data_dir)?;
        let child = command
            .spawn()
            .map_err(|error| format!("Cannot start MiniAgentOS Daemon: {error}"))?;
        let pid = child.id();
        self.child = Some(child);

        wait_until_ready(self.child.as_mut().expect("managed child exists"), port)?;
        self.status = DesktopRuntimeStatus {
            embedded: true,
            environment: environment.to_owned(),
            state: "ready".to_owned(),
            daemon_url: Some(daemon_url),
            pid: Some(pid),
            message: None,
        };
        Ok(())
    }

    fn stop(&mut self) {
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

impl Drop for DaemonSupervisor {
    fn drop(&mut self) {
        self.stop();
    }
}

#[tauri::command]
fn desktop_runtime_status(state: State<'_, Mutex<DaemonSupervisor>>) -> DesktopRuntimeStatus {
    state
        .lock()
        .expect("desktop runtime mutex poisoned")
        .status
        .clone()
}

#[tauri::command]
fn restart_desktop_runtime(
    app: AppHandle,
    state: State<'_, Mutex<DaemonSupervisor>>,
) -> DesktopRuntimeStatus {
    let mut supervisor = state.lock().expect("desktop runtime mutex poisoned");
    supervisor.start(&app);
    supervisor.status.clone()
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            let mut supervisor = DaemonSupervisor::new();
            supervisor.start(app.handle());
            app.manage(Mutex::new(supervisor));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            desktop_runtime_status,
            restart_desktop_runtime
        ])
        .build(tauri::generate_context!())
        .expect("error while building MiniAgentOS Coder desktop host");

    app.run(|app_handle, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            let state = app_handle.state::<Mutex<DaemonSupervisor>>();
            if let Ok(mut supervisor) = state.lock() {
                supervisor.stop();
            };
        }
    });
}

fn available_loopback_port() -> Result<u16, String> {
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
        .map_err(|error| format!("Cannot reserve a loopback port: {error}"))?;
    listener
        .local_addr()
        .map(|address| address.port())
        .map_err(|error| format!("Cannot inspect the reserved loopback port: {error}"))
}

fn daemon_command(port: u16, data_dir: &Path) -> Result<Command, String> {
    #[cfg(debug_assertions)]
    let mut command = development_daemon_command(port)?;

    #[cfg(not(debug_assertions))]
    let mut command = production_daemon_command()?;

    command
        .env("MINIAGENTOS_PORT", port.to_string())
        .env("MINIAGENTOS_HOME", data_dir)
        .env("PYTHONUNBUFFERED", "1")
        .stdin(Stdio::null());
    Ok(command)
}

#[cfg(debug_assertions)]
fn development_daemon_command(port: u16) -> Result<Command, String> {
    let repository = repository_root();
    let backend = repository.join("backend");
    let python = if cfg!(windows) {
        backend.join(".venv/Scripts/python.exe")
    } else {
        backend.join(".venv/bin/python")
    };
    if !python.is_file() {
        return Err(format!(
            "Backend virtual environment is missing at {}",
            python.display()
        ));
    }

    let mut command = Command::new(python);
    command.current_dir(&backend).args([
        "-m",
        "uvicorn",
        "app.main:app",
        "--host",
        "127.0.0.1",
        "--port",
        &port.to_string(),
    ]);
    let env_path = repository.join(".env");
    if env_path.is_file() {
        command.arg("--env-file").arg(env_path);
    }
    Ok(command)
}

#[cfg(not(debug_assertions))]
fn production_daemon_command() -> Result<Command, String> {
    let executable = std::env::current_exe()
        .map_err(|error| format!("Cannot locate desktop executable: {error}"))?;
    let sidecar_name = if cfg!(windows) {
        "miniagentos-daemon.exe"
    } else {
        "miniagentos-daemon"
    };
    let sidecar = executable
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join(sidecar_name);
    if !sidecar.is_file() {
        return Err(format!(
            "Bundled Daemon is missing at {}",
            sidecar.display()
        ));
    }
    Ok(Command::new(sidecar))
}

#[cfg(debug_assertions)]
fn repository_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(Path::parent)
        .expect("src-tauri must live under frontend")
        .to_path_buf()
}

fn attach_log_output(command: &mut Command, data_dir: &Path) -> Result<(), String> {
    let log_path = data_dir.join("daemon.log");
    let stdout = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|error| format!("Cannot open Daemon log {}: {error}", log_path.display()))?;
    let stderr = stdout
        .try_clone()
        .map_err(|error| format!("Cannot clone Daemon log handle: {error}"))?;
    command
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr));
    Ok(())
}

fn wait_until_ready(child: &mut Child, port: u16) -> Result<(), String> {
    let deadline = Instant::now() + READY_TIMEOUT;
    while Instant::now() < deadline {
        if let Some(status) = child
            .try_wait()
            .map_err(|error| format!("Cannot inspect Daemon process: {error}"))?
        {
            return Err(format!(
                "Daemon exited before readiness with status {status}"
            ));
        }
        if health_check(port) {
            return Ok(());
        }
        thread::sleep(HEALTH_INTERVAL);
    }
    Err(format!(
        "Daemon did not become healthy within {} seconds",
        READY_TIMEOUT.as_secs()
    ))
}

fn health_check(port: u16) -> bool {
    let address = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port);
    let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(200)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(250)));
    let request =
        format!("GET /health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let mut response = String::new();
    stream.read_to_string(&mut response).is_ok()
        && response.starts_with("HTTP/1.1 200")
        && response.contains("\"status\":\"ok\"")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reserves_loopback_port() {
        assert!(available_loopback_port().expect("loopback port") > 0);
    }

    #[test]
    fn source_layout_resolves_repository() {
        assert!(repository_root().join("backend/app/main.py").is_file());
    }
}
