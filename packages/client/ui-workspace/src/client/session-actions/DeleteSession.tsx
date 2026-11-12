/** Permanent Session deletion confirmation. */
import { useState } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  SessionDeleteConfirmInjected, SessionDeleteConfirmProps, SessionDeleteConfirmRequest,
} from '../contract/slots.ts'

/**
 * The `shell.overlay` entry: nothing while no deletion is pending, otherwise
 * one dialog per request (keyed by the Session). Confirming deletes the stored
 * log; cancelling leaves everything in place.
 * @param props - the request hook, its settlement, the delete hop, and the locale seat.
 * @returns the open dialog, or null.
 */
export function SessionDeleteConfirmDialog({
  useDeleteRequest, settleSessionDelete, deleteSession, t,
}: SessionDeleteConfirmProps) {
  const request = useDeleteRequest(pending => pending)
  if (request === null) return null
  return (
    <DeleteConfirmForm
      key={request.sessionId}
      request={request}
      deleteSession={deleteSession}
      onSettle={settleSessionDelete}
      t={t}
    />
  )
}

/** One request's dialog: in-flight and error state die with it. */
function DeleteConfirmForm({ request, deleteSession, onSettle, t }: {
  request: SessionDeleteConfirmRequest
  deleteSession: SessionDeleteConfirmInjected['deleteSession']
  onSettle: () => void
  t: SessionDeleteConfirmProps['t']
}) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const close = () => { if (!deleting) onSettle() }
  const confirm = () => {
    setDeleting(true)
    setError(null)
    deleteSession(request.sessionId).then(() => {
      setDeleting(false)
      onSettle()
    }).catch((reason: unknown) => {
      setDeleting(false)
      setError(reason instanceof Error ? reason.message : String(reason))
    })
  }
  return (
    <Modal
      open
      onClose={close}
      closeLabel={t('deleteSession.cancel')}
      title={t('deleteSession.title')}
      description={t('deleteSession.body', { title: request.displayTitle })}
      footer={<>
        <Button variant="outline" onClick={close} disabled={deleting}>{t('deleteSession.cancel')}</Button>
        <Button variant="primary" onClick={confirm} disabled={deleting}>{t('deleteSession.confirm')}</Button>
      </>}
    >
      {error === null ? null : <p role="alert">{t('deleteSession.failed', { message: error })}</p>}
    </Modal>
  )
}
