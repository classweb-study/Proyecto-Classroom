import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { api, errorMessage, formatDate } from '../lib/api';

type Message = {
  id: string;
  fromAdmin: boolean;
  authorLogin?: string | null;
  body: string;
  createdAt: string;
};

type RequestMessagesProps = {
  /** `/me/access-requests/:id/messages` or the admin equivalent. */
  endpoint: string;
  viewer: 'requester' | 'admin';
};

/**
 * Internal conversation between an institution's admins and a requester.
 * Neither side ever sees the other's email address.
 */
export function RequestMessages({ endpoint, viewer }: RequestMessagesProps) {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ messages: Message[] }>(endpoint)
      .then(body => setMessages(body.messages))
      .catch(() => setMessages([]));
  }, [endpoint]);

  useEffect(load, [load]);

  async function send(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await api(endpoint, { method: 'POST', body: { body: draft } });
      setDraft('');
      load();
    } catch (sendError) {
      setError(errorMessage(sendError, 'No pudimos enviar el mensaje.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="message-thread">
      {messages === null ? (
        <div className="loader small" />
      ) : messages.length === 0 ? (
        <p className="field-hint">
          {viewer === 'admin'
            ? 'Escribe al solicitante si necesitas más información. No verá tu correo.'
            : 'Aquí aparecerán los mensajes del administrador de la institución.'}
        </p>
      ) : (
        <ol>
          {messages.map(message => {
            const mine =
              (viewer === 'admin') === message.fromAdmin;
            const author = message.fromAdmin
              ? viewer === 'admin' && message.authorLogin
                ? `@${message.authorLogin} (administración)`
                : 'Administración'
              : viewer === 'admin' && message.authorLogin
                ? `@${message.authorLogin}`
                : 'Tú';

            return (
              <li key={message.id} className={mine ? 'mine' : ''}>
                <span className="message-author">
                  {author} · {formatDate(message.createdAt)}
                </span>
                <p className="pre-wrap">{message.body}</p>
              </li>
            );
          })}
        </ol>
      )}

      <form className="message-form" onSubmit={send}>
        <label className="visually-hidden" htmlFor={`msg-${endpoint}`}>
          Mensaje
        </label>
        <textarea
          id={`msg-${endpoint}`}
          rows={2}
          maxLength={2000}
          required
          placeholder="Escribe un mensaje…"
          value={draft}
          onChange={event => setDraft(event.target.value)}
        />
        <button
          type="submit"
          className="secondary-action"
          disabled={busy || draft.trim() === ''}
        >
          {busy ? 'Enviando…' : 'Enviar'}
        </button>
      </form>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
