/** Re-mounts on every navigation, so each page fades in smoothly (CSS only, no JS). */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
