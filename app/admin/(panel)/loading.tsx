/** Skeleton inside the admin shell: the tab bar stays put, only the content area shimmers. */
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="skeleton h-10 w-2/3" />
      <div className="skeleton h-32" />
      <div className="skeleton h-48" />
      <div className="skeleton h-28" />
    </div>
  );
}
