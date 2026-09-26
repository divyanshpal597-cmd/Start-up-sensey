import { Link } from "react-router-dom";
import { EmptyState, SIZE, cx } from "../components/ui";

export default function NotFound() {
  return (
    <EmptyState
      title="Page not found"
      body="That page does not exist."
      action={<Link to="/" className={cx("btn-primary", SIZE.md)}>Go to dashboard</Link>}
    />
  );
}
