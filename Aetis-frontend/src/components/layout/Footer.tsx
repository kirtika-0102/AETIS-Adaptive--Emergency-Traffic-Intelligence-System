import { Link } from "react-router-dom";

import { ROUTES } from "../../routes/routePaths";

const LINKS = [
  { id: "home", label: "Home" },
  { id: "features", label: "Features" },
  { id: "how-it-works", label: "How it Works" },
  { id: "impact", label: "Impact" },
  { id: "about", label: "About" },
] as const;

const HELPLINES = [
  { number: "108", label: "Medical" },
  { number: "100", label: "Police" },
  { number: "101", label: "Fire" },
] as const;

function Footer() {
  return (
    <footer className="border-t border-[var(--border-subtle)] bg-[var(--bg-surface-muted)]">
      <div className="container-aetis py-10">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div>
            <Link
              to={{ pathname: ROUTES.HOME, hash: "#home" }}
              className="inline-flex flex-col leading-none"
              aria-label="AETIS home"
            >
              <span className="font-[var(--font-display)] text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
                AETIS
              </span>
              <span className="mt-1 text-xs text-[var(--text-muted)]">
                Safer Roads. Faster Response.
              </span>
            </Link>

            <p className="mt-4 max-w-xs text-sm text-[var(--text-secondary)]">
              Connecting people in emergencies with the right help, faster.
            </p>
          </div>

          <nav aria-label="Footer">
            <ul className="flex flex-wrap gap-x-8 gap-y-3">
              {LINKS.map((link) => (
                <li key={link.id}>
                  <Link
                    to={{ pathname: ROUTES.HOME, hash: `#${link.id}` }}
                    className="text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  to={ROUTES.LOGIN}
                  className="text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                >
                  Sign in
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-[var(--border-default)] pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-[var(--text-muted)]">
            &copy; {new Date().getFullYear()} AETIS. All rights reserved.
          </p>

          <p className="text-xs text-[var(--text-secondary)]">
            In an emergency, call{" "}
            {HELPLINES.map((h, i) => (
              <span key={h.number}>
                <span className="font-[var(--font-mono)] font-semibold text-[var(--text-primary)]">
                  {h.number}
                </span>{" "}
                ({h.label})
                {i < HELPLINES.length - 1 ? ", " : ""}
              </span>
            ))}
            . AETIS is a tool for dispatchers and does not take emergency calls.
          </p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;