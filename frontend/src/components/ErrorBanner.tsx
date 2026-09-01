import { AlertCircle } from "lucide-react";
import { usePreferences } from "../preferences";
import { isRuntimeConnectionError } from "../run/helpers";

export function ErrorBanner({ message }: { message: string }) {
  const { t } = usePreferences();
  const displayMessage = isRuntimeConnectionError(message)
    ? t("error.daemonUnavailable")
    : message;

  return (
    <div className="errorBanner" role="alert">
      <AlertCircle size={17} />
      <span>{displayMessage}</span>
    </div>
  );
}
