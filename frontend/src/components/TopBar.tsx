import { Activity, Bot, Box, Cpu, Settings } from "lucide-react";

interface TopBarProps {
  project: string;
  mode: string;
  status: string;
  model: string;
  modelConfigured: boolean | undefined;
}

export function TopBar({ project, mode, status, model, modelConfigured }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brandMark">
          <Box size={18} />
        </div>
        <div>
          <div className="brandName">MiniAgentOS Coder</div>
          <div className="brandMeta">{project}</div>
        </div>
      </div>
      <div className="topbarControls">
        <div className="pill">
          <Cpu size={15} />
          <span>{mode}</span>
        </div>
        <div className="pill">
          <Activity size={15} />
          <span>{status}</span>
        </div>
        <div className={`pill ${modelConfigured === false ? "pillWarning" : ""}`}>
          <Bot size={15} />
          <span>{model}</span>
        </div>
        <button className="iconButton" aria-label="Settings">
          <Settings size={17} />
        </button>
      </div>
    </header>
  );
}
