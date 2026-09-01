import type { RefObject } from "react";
import { ArrowUp, FlaskConical, MessageSquareText, Wrench } from "lucide-react";
import type { TranslationKey } from "../i18n";
import { usePreferences } from "../preferences";

interface FollowUpComposerProps {
  value: string;
  busy: boolean;
  templates: TranslationKey[];
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onUseTemplate: (template: TranslationKey) => void;
}

export function FollowUpComposer({
  value,
  busy,
  templates,
  inputRef,
  onChange,
  onSubmit,
  onUseTemplate,
}: FollowUpComposerProps) {
  const { t } = usePreferences();
  const disabled = !value.trim() || busy;

  return (
    <section className="followUpComposer">
      <label htmlFor="follow-up-task">{t("session.followUp")}</label>
      <div>
        <textarea
          id="follow-up-task"
          ref={inputRef}
          rows={2}
          value={value}
          placeholder={t("session.followUpPlaceholder")}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && value.trim()) {
              event.preventDefault();
              onSubmit();
            }
          }}
        />
        <button type="button" disabled={disabled} onClick={onSubmit} title={t("session.sendFollowUp")} aria-label={t("session.sendFollowUp")}>
          <ArrowUp size={17} />
        </button>
      </div>
      <div className="followUpTemplates" aria-label={t("session.templates")}>
        <span>{t("session.templatesShort")}</span>
        {templates.map((template) => (
          <TemplateButton busy={busy} key={template} template={template} onClick={() => onUseTemplate(template)} />
        ))}
      </div>
    </section>
  );
}

function TemplateButton({
  busy,
  template,
  onClick,
}: {
  busy: boolean;
  template: TranslationKey;
  onClick: () => void;
}) {
  const { t } = usePreferences();
  const Icon = template === "session.template.fixFailure"
    ? Wrench
    : template === "session.template.addTests"
      ? FlaskConical
      : MessageSquareText;
  return (
    <button type="button" disabled={busy} onClick={onClick}>
      <Icon size={13} />
      {t(template)}
    </button>
  );
}
