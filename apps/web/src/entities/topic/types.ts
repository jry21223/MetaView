/** Subject domain a playbook belongs to. Mirrors backend TopicDomain.
 *  Lives in its own module so the playbook contract no longer depends on
 *  the CIR diagnostic types. */
export type TopicDomain =
  | "algorithm"
  | "math"
  | "code"
  | "physics"
  | "chemistry"
  | "biology"
  | "geography";
