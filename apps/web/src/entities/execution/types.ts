/** User-adjustable runtime parameter surfaced in the playbook (e.g. array
 *  length). Part of the PlaybookScript output contract, not a CIR internal —
 *  lives in its own module so the contract no longer depends on cir/types. */
export interface ExecutionParameterControl {
  id: string;
  label: string;
  value: string;
  description?: string | null;
  placeholder?: string | null;
}
