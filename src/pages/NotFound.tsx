import { Link } from "react-router-dom";
import { EmptyState, SIZE, cx } from "../components/ui";
import { t } from "../lib/i18n";

export default function NotFound() {
  return (
    <EmptyState
      title={t("Page not found")}
      body={t("That page does not exist.")}
      action={<Link to="/" className={cx("btn-primary", SIZE.md)}>{t("Go to dashboard")}</Link>}
    />
  );
}
