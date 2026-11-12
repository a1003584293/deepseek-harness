/** Reusable user contents inside a caller-owned message row. */
import { Fragment } from 'react'
import type { FactoryComponentPropsOf } from '@deepseek-ai/dsh-client-ui-slots'
import { fileExtension, FileTypeIcon, fileSizeText, JsonBlock, UserMessageBubble } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './MessageItem.module.css'

const EMPTY_LABELS: readonly string[] = []

/** Localized-free label for a pinned path card: leaf name plus an optional line range. */
function referenceTitle(path: string, startLine?: number, endLine?: number): string {
  const name = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1) || path
  return startLine === undefined || endLine === undefined ? name : `${name} ${startLine}-${endLine}`
}

/**
 * Render prepared text, ordered attachments, and references without message chrome.
 * The caller owns row identity, pending/echo state, time, and message actions.
 * @param props - prepared content, facts, authorized image loader, file navigation, and framework Factory/locale seats.
 * @returns the content stack using the existing user-message layout.
 */
export function UserContent({
  content, loadImage, openFile, facts, interactive = false, ellipsis = false, renderSlot, renderFactorySlot, t,
}: FactoryComponentPropsOf<'conversation.chat.user.content'>) {
  const { text, attachments, extraBlocks, referenceLabels = EMPTY_LABELS } = content
  const compactImages = attachments.length > 1
  const truncated = (total: number): string => t('json.truncated', { total })
  const showBubble = text !== '' || extraBlocks.length > 0
  return (
    <div className={css.userStack}>
      {attachments.length > 0 && (
        <div className={css.attachmentRow} data-message-attachments>
          {attachments.map((attachment, index) => attachment.type === 'image'
            ? (
              <Fragment key={`image:${index}`}>
                {renderSlot('conversation.chat.user.images', {
                  images: [attachment.image], loadImage, align: 'end', compact: compactImages,
                })}
              </Fragment>
            )
            : attachment.type === 'terminal'
              ? (
                <span key={`terminal:${index}`} className={css.referenceChip} title={attachment.terminal.cwd}>
                  <span className={css.referenceName}>
                    {t('message.terminalSelection', { lines: attachment.terminal.text.split('\n').length })}
                  </span>
                </span>
              )
              : attachment.type === 'reference'
                ? (
                  <button
                    key={`reference:${index}`}
                    type="button"
                    className={css.referenceChip}
                    title={attachment.reference.path}
                    disabled={openFile === undefined}
                    onClick={() => openFile?.(attachment.reference.path, {
                      ...attachment.reference.startLine === undefined ? {} : { line: attachment.reference.startLine },
                    })}
                  >
                    <FileTypeIcon path={attachment.reference.path} className={css.referenceIcon} />
                    <span className={css.referenceName}>
                      {referenceTitle(attachment.reference.path, attachment.reference.startLine, attachment.reference.endLine)}
                    </span>
                  </button>
                )
                : (
                  <span key={`file:${index}`} className={css.fileCard} title={attachment.file.name}>
                    <FileTypeIcon path={attachment.file.name} className={css.fileIcon} />
                    <span className={css.fileContent}>
                      <span className={css.fileName}>{attachment.file.name}</span>
                      <span className={css.fileMeta}>
                        {[fileExtension(attachment.file.name).toUpperCase().slice(0, 8), fileSizeText(attachment.file.bytes)]
                          .filter(Boolean).join(' ')}
                      </span>
                    </span>
                  </span>
                ))}
        </div>
      )}
      {showBubble && <UserMessageBubble data-message-bubble="" data-text-interaction-source="">
        {renderFactorySlot('conversation.user.text', { text, facts, interactive, ellipsis })}
        {extraBlocks.map((block, index) => (
          <JsonBlock key={index} label={t('message.extraBlock')} payload={block} truncatedLabel={truncated} />
        ))}
      </UserMessageBubble>}
      {referenceLabels.length > 0 && (
        <div className={css.referenceSummary}>
          {t('message.referenceSummary', { labels: referenceLabels.join(t('message.referenceSeparator')) })}
        </div>
      )}
    </div>
  )
}
