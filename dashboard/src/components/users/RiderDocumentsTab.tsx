import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Eye, FilePlus2, FileText, Loader2, Pencil, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { Modal } from '../common/Modal';
import { pushToast } from '../../hooks/useToast';
import type { Role } from '../../hooks/useAuth';
import {
  createRiderDocumentSignedUrl,
  deleteRiderDocument,
  getRiderDocumentDisplayStatus,
  listRiderDocuments,
  OPTIONAL_DOCUMENT_TYPES,
  REQUIRED_DOCUMENT_TYPES,
  RIDER_DOCUMENT_LABELS,
  saveRiderDocument,
  verifyRiderDocument,
  type RiderDocumentInput,
  type RiderDocumentType,
  type RiderDocumentWithPeople,
} from '../../services/riderDocumentService';

interface RiderDocumentsTabProps {
  riderId: string;
  role: Role | undefined;
}

const STATUS_STYLE = {
  missing: ['Missing', 'bg-slate-100 text-slate-700 border-slate-200'],
  pending: ['Pending Verification', 'bg-amber-50 text-amber-800 border-amber-200'],
  verified: ['Verified', 'bg-emerald-50 text-emerald-700 border-emerald-200'],
  expiring_soon: ['Expiring Soon', 'bg-orange-50 text-orange-800 border-orange-200'],
  expired: ['Expired', 'bg-red-50 text-red-700 border-red-200'],
} as const;

const EMPTY_INPUT: RiderDocumentInput = {
  documentType: 'drivers_license',
  documentLabel: '',
  documentNumber: '',
  issueDate: '',
  expirationDate: '',
  notes: '',
};

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function DocumentStatusBadge({ document }: { document: RiderDocumentWithPeople | null }) {
  const status = getRiderDocumentDisplayStatus(document);
  const [label, style] = STATUS_STYLE[status];
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${style}`}>{label}</span>;
}

export function RiderDocumentsTab({ riderId, role }: RiderDocumentsTabProps) {
  const canManage = role === 'admin' || role === 'hr';
  const [documents, setDocuments] = useState<RiderDocumentWithPeople[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<RiderDocumentWithPeople | null>(null);
  const [deleting, setDeleting] = useState<RiderDocumentWithPeople | null>(null);
  const [input, setInput] = useState<RiderDocumentInput>(EMPTY_INPUT);
  const [file, setFile] = useState<File | null>(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDocuments(await listRiderDocuments(riderId));
    } catch (error) {
      pushToast({
        title: 'Unable to load documents',
        description: error instanceof Error ? error.message : 'Please try again.',
        tone: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [riderId]);

  useEffect(() => { void load(); }, [load]);

  const standardDocuments = useMemo(
    () => new Map(documents.filter((doc) => doc.document_type !== 'other').map((doc) => [doc.document_type, doc])),
    [documents],
  );
  const otherDocuments = documents.filter((doc) => doc.document_type === 'other');

  const openCreate = (documentType: RiderDocumentType) => {
    setEditing(null);
    setInput({ ...EMPTY_INPUT, documentType });
    setFile(null);
    setFormError('');
    setEditorOpen(true);
  };

  const openReplace = (document: RiderDocumentWithPeople) => {
    setEditing(document);
    setInput({
      documentType: document.document_type as RiderDocumentType,
      documentLabel: document.document_label ?? '',
      documentNumber: document.document_number ?? '',
      issueDate: document.issue_date ?? '',
      expirationDate: document.expiration_date ?? '',
      notes: document.notes ?? '',
    });
    setFile(null);
    setFormError('');
    setEditorOpen(true);
  };

  const handleSave = async () => {
    if (!file) {
      setFormError(editing ? 'Select the replacement file.' : 'Select a document file.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      await saveRiderDocument(riderId, file, input, editing ?? undefined);
      pushToast({
        title: editing ? 'Document replaced' : 'Document uploaded',
        description: 'The document is pending verification.',
        tone: 'success',
      });
      setEditorOpen(false);
      await load();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to save the document.');
    } finally {
      setSaving(false);
    }
  };

  const handleView = async (document: RiderDocumentWithPeople) => {
    setBusyId(document.id);
    try {
      const url = await createRiderDocumentSignedUrl(document.storage_path);
      const link = window.document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.click();
    } catch (error) {
      pushToast({ title: 'Unable to open document', description: error instanceof Error ? error.message : 'Please try again.', tone: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const handleVerify = async (document: RiderDocumentWithPeople) => {
    setBusyId(document.id);
    try {
      await verifyRiderDocument(document.id);
      pushToast({ title: 'Document verified', description: `${document.document_label || RIDER_DOCUMENT_LABELS[document.document_type as RiderDocumentType]} is now verified.`, tone: 'success' });
      await load();
    } catch (error) {
      pushToast({ title: 'Verification failed', description: error instanceof Error ? error.message : 'Please try again.', tone: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setBusyId(deleting.id);
    try {
      await deleteRiderDocument(deleting);
      pushToast({ title: 'Document deleted', description: 'The document and its private file were removed.', tone: 'success' });
      setDeleting(null);
      await load();
    } catch (error) {
      pushToast({ title: 'Delete failed', description: error instanceof Error ? error.message : 'Please try again.', tone: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const renderDocument = (documentType: RiderDocumentType, required: boolean, document: RiderDocumentWithPeople | null) => (
    <article key={document?.id ?? documentType} className="rounded-xl border border-border bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <h4 className="text-sm font-bold text-foreground">{document?.document_label || RIDER_DOCUMENT_LABELS[documentType]}</h4>
            {required && <span className="text-[10px] font-semibold text-muted-foreground">Required</span>}
            <DocumentStatusBadge document={document} />
          </div>
          {document ? (
            <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2 text-xs md:grid-cols-3">
              <div><dt className="text-muted-foreground">Document number</dt><dd className="font-semibold text-foreground">{document.document_number || '—'}</dd></div>
              <div><dt className="text-muted-foreground">Issue date</dt><dd className="font-semibold text-foreground">{formatDate(document.issue_date)}</dd></div>
              <div><dt className="text-muted-foreground">Expiration date</dt><dd className="font-semibold text-foreground">{formatDate(document.expiration_date)}</dd></div>
              <div><dt className="text-muted-foreground">Uploaded by</dt><dd className="font-semibold text-foreground">{document.uploadedByName}</dd></div>
              <div><dt className="text-muted-foreground">Uploaded date</dt><dd className="font-semibold text-foreground">{new Date(document.updated_at).toLocaleString('en-PH')}</dd></div>
              <div><dt className="text-muted-foreground">Verified by</dt><dd className="font-semibold text-foreground">{document.verifiedByName || '—'}</dd></div>
              {document.notes && <div className="col-span-2 md:col-span-3"><dt className="text-muted-foreground">Notes</dt><dd className="mt-0.5 whitespace-pre-wrap text-foreground">{document.notes}</dd></div>}
            </dl>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">No document has been uploaded.</p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {document && <button type="button" onClick={() => void handleView(document)} disabled={busyId === document.id} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-white px-3 text-xs font-semibold hover:bg-panel-bg disabled:opacity-50"><Eye className="h-3.5 w-3.5" /> View</button>}
          {canManage && document && document.verification_status !== 'verified' && <button type="button" onClick={() => void handleVerify(document)} disabled={busyId === document.id} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"><ShieldCheck className="h-3.5 w-3.5" /> Verify</button>}
          {canManage && <button type="button" onClick={() => document ? openReplace(document) : openCreate(documentType)} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-white hover:bg-primary-hover"><Pencil className="h-3.5 w-3.5" /> {document ? 'Replace' : 'Upload'}</button>}
          {canManage && document && <button type="button" onClick={() => setDeleting(document)} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-red-200 text-red-600 hover:bg-red-50" aria-label={`Delete ${document.document_label || RIDER_DOCUMENT_LABELS[documentType]}`}><Trash2 className="h-3.5 w-3.5" /></button>}
        </div>
      </div>
    </article>
  );

  if (loading) return <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading documents…</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-bold text-foreground">Employee Documents</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Private compliance files. Expiring Soon means the document expires within 30 days.</p>
        </div>
        {canManage && <button type="button" onClick={() => openCreate('other')} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-white px-3 text-xs font-semibold hover:bg-panel-bg"><FilePlus2 className="h-4 w-4 text-primary" /> Add optional document</button>}
      </div>

      <section className="space-y-3" aria-labelledby="required-documents-heading">
        <h3 id="required-documents-heading" className="text-xs font-bold uppercase tracking-wider text-accent-foreground">Required documents</h3>
        {REQUIRED_DOCUMENT_TYPES.map((type) => renderDocument(type, true, standardDocuments.get(type) ?? null))}
      </section>

      <section className="space-y-3" aria-labelledby="optional-documents-heading">
        <h3 id="optional-documents-heading" className="text-xs font-bold uppercase tracking-wider text-accent-foreground">Optional documents</h3>
        {OPTIONAL_DOCUMENT_TYPES.filter((type) => type !== 'other').map((type) => renderDocument(type, false, standardDocuments.get(type) ?? null))}
        {otherDocuments.map((document) => renderDocument('other', false, document))}
      </section>

      <Modal open={editorOpen} onClose={() => !saving && setEditorOpen(false)} title={editing ? 'Replace document' : 'Upload document'} subtitle={editing ? 'Replacing the file resets verification to Pending Verification.' : 'Files are stored privately and can only be opened through a secure link.'} size="lg" dismissible={!saving}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-semibold text-foreground">Document type *<select value={input.documentType} onChange={(event) => setInput((current) => ({ ...current, documentType: event.target.value as RiderDocumentType }))} className="ar-input" disabled={Boolean(editing)}>{[...REQUIRED_DOCUMENT_TYPES, ...OPTIONAL_DOCUMENT_TYPES].map((type) => <option key={type} value={type}>{RIDER_DOCUMENT_LABELS[type]}</option>)}</select></label>
            {input.documentType === 'other' && <label className="space-y-1 text-xs font-semibold text-foreground">Document name *<input value={input.documentLabel} onChange={(event) => setInput((current) => ({ ...current, documentLabel: event.target.value }))} className="ar-input" /></label>}
            <label className="space-y-1 text-xs font-semibold text-foreground">Document number<input value={input.documentNumber} onChange={(event) => setInput((current) => ({ ...current, documentNumber: event.target.value }))} className="ar-input" /></label>
            <label className="space-y-1 text-xs font-semibold text-foreground">Issue date<input type="date" value={input.issueDate} onChange={(event) => setInput((current) => ({ ...current, issueDate: event.target.value }))} className="ar-input" /></label>
            <label className="space-y-1 text-xs font-semibold text-foreground">Expiration date<input type="date" min={input.issueDate || undefined} value={input.expirationDate} onChange={(event) => setInput((current) => ({ ...current, expirationDate: event.target.value }))} className="ar-input" /></label>
            <label className="space-y-1 text-xs font-semibold text-foreground sm:col-span-2">Notes<textarea value={input.notes} onChange={(event) => setInput((current) => ({ ...current, notes: event.target.value }))} className="ar-textarea" rows={3} /></label>
          </div>
          <div>
            <input ref={fileInputRef} type="file" className="sr-only" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setFormError(''); }} />
            <button type="button" onClick={() => fileInputRef.current?.click()} className="flex min-h-20 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-panel-bg text-sm font-semibold text-foreground hover:border-primary/40"><Upload className="h-4 w-4 text-primary" /> {file ? file.name : 'Choose PDF or image (maximum 5 MB)'}</button>
          </div>
          {formError && <p role="alert" className="text-xs font-medium text-red-600">{formError}</p>}
          <div className="flex justify-end gap-2 border-t border-border pt-4"><button type="button" onClick={() => setEditorOpen(false)} disabled={saving} className="h-9 rounded-md border border-border px-4 text-xs font-semibold">Cancel</button><button type="button" onClick={() => void handleSave()} disabled={saving} className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-xs font-semibold text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save document</button></div>
        </div>
      </Modal>

      <Modal open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Delete document" subtitle="This removes both the record and the private file." size="sm" dismissible={!busyId}>
        <p className="text-sm text-muted-foreground">Delete {deleting?.document_label || (deleting ? RIDER_DOCUMENT_LABELS[deleting.document_type as RiderDocumentType] : 'this document')}? This cannot be undone.</p>
        <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setDeleting(null)} disabled={Boolean(busyId)} className="h-9 rounded-md border border-border px-4 text-xs font-semibold">Cancel</button><button type="button" onClick={() => void handleDelete()} disabled={Boolean(busyId)} className="inline-flex h-9 items-center gap-2 rounded-md bg-red-600 px-4 text-xs font-semibold text-white disabled:opacity-50">{busyId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete</button></div>
      </Modal>
    </div>
  );
}
