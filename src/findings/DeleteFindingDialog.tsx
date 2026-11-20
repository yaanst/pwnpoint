import { ConfirmDialog } from '../ui/ConfirmDialog';
import { type Finding, findingRef } from './model';

export function DeleteFindingDialog(props: {
  finding: Finding;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = findingRef(props.finding.number);
  return (
    <ConfirmDialog
      title={`Delete ${ref}?`}
      confirmLabel="Delete finding"
      danger
      onConfirm={props.onConfirm}
      onCancel={props.onCancel}
    >
      <p>
        <strong>{props.finding.title || 'Untitled finding'}</strong> will be deleted from this
        browser. This cannot be undone.
      </p>
      <p>The number {ref} will not be reused, so references in reports already sent stay valid.</p>
    </ConfirmDialog>
  );
}
