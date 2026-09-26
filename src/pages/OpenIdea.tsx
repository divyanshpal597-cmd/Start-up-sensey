import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useCurrentIdea } from "../context/CurrentIdea";
import { LoadingBlock } from "../components/ui";

/** /ideas/:ideaId — makes the idea current and opens its saved analysis on the dashboard. */
export default function OpenIdea() {
  const { ideaId } = useParams();
  const { selectIdea } = useCurrentIdea();
  const nav = useNavigate();
  useEffect(() => {
    if (!ideaId) return;
    selectIdea(ideaId).then(() => nav("/", { replace: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ideaId]);
  return <LoadingBlock label="Opening saved analysis…" />;
}
