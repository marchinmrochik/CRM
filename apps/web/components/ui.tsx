'use client';
import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { X, AlertCircle } from 'lucide-react';
import { ApiError } from '../lib/api';
import { useLocale } from './locale';

export function Badge({ value }: { value: string }) {
  const { label } = useLocale();
  return <span className={`badge badge-${value}`}>{label(value)}</span>;
}
export function ErrorNotice({ error }: { error: Error | null }) {
  const { t } = useLocale();
  return error ? (
    <div className="error" role="alert">
      <AlertCircle size={18} />
      <div>
        {t(
          error instanceof TypeError
            ? 'Cannot reach the API. Check System activity and retry.'
            : error.message,
        )}
        {error instanceof ApiError &&
          error.fields?.map((field, index) => (
            <small key={index}>
              {t('Invalid value: {field}', {
                field: t(
                  (
                    {
                      name: 'Company name',
                      title: 'Role title',
                      website: 'Website (optional, HTTPS)',
                      description: 'Full job description',
                      submittedAt: 'Submission date (for Applied)',
                      timezone: 'Timezone',
                      dueAt: 'Due date',
                      content: 'Note',
                    } as Record<string, string>
                  )[field.field] ?? field.field,
                ),
              })}
            </small>
          ))}
        {error instanceof ApiError && error.requestId && (
          <small>{t('Request: {id}', { id: error.requestId })}</small>
        )}
      </div>
    </div>
  ) : null;
}
export function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const { t } = useLocale();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} onCancel={onClose} className="modal">
      <div className="modal-title">
        <h2>{title}</h2>
        <button className="icon-button" aria-label={t('Close dialog')} onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Form({
  children,
  onSubmit,
  submit = 'Save',
  onDone,
}: {
  children: React.ReactNode;
  onSubmit: (data: FormData) => Promise<unknown>;
  submit?: string;
  onDone?: () => void;
}) {
  const { t } = useLocale();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        setPending(true);
        setError(null);
        try {
          await onSubmit(new FormData(form));
          form.reset();
          onDone?.();
        } catch (error) {
          setError(error instanceof Error ? error : new Error(t('Request failed.')));
        } finally {
          setPending(false);
        }
      }}
    >
      <fieldset disabled={pending}>
        {children}
        <ErrorNotice error={error} />
        <button className="button primary" type="submit">
          {pending ? t('Saving…') : t(submit)}
        </button>
      </fieldset>
    </form>
  );
}
export function Field({ label: text, children }: { label: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{text}</label>
      {isValidElement(children)
        ? cloneElement(children as ReactElement<{ id?: string }>, { id })
        : children}
    </div>
  );
}
