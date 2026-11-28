import { Link } from "react-router-dom";
import { EmptyState, Tile } from "../ui/primitives";

export default function NotFound() {
  return (
    <Tile>
      <EmptyState icon="search" title="Page introuvable" action={<Link className="btn btn--ink btn--md" to="/">Retour à l'accueil</Link>}>
        Le lien est peut-être erroné, ou la page a été déplacée.
      </EmptyState>
    </Tile>
  );
}
