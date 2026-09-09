export type NavigatorRole = "public" | "registered" | "moderator" | "admin" | "reviewer";
export type SurfaceDepth = "public_summary" | "user_contribution" | "moderation_triage" | "admin_operations" | "technical_depth";
export type RouteVisibility = "primary_nav" | "secondary_nav" | "direct_link" | "hidden";
export type SurfaceGroup = "public" | "collections" | "user" | "moderation" | "admin";

export type MainSection =
  | "explore"
  | "use-cases"
  | "organs"
  | "events"
  | "docs"
  | "release-guide"
  | "internal-docs"
  | "persons"
  | "literature"
  | "scores"
  | "iconography"
  | "temperaments"
  | "models"
  | "map"
  | "contribute"
  | "me"
  | "me-contributions"
  | "me-saved"
  | "me-notifications"
  | "places"
  | "people"
  | "institutions"
  | "vmi";

export type SurfaceDefinition = {
  id: MainSection;
  path: string;
  label: string;
  group: SurfaceGroup;
  requiredRole: NavigatorRole;
  defaultDepth: SurfaceDepth;
  visibility: RouteVisibility;
  directLink: boolean;
  endpointSensitivity: "public_read" | "registered_user" | "moderator_read" | "admin_read";
};

export const ROLE_ORDER: NavigatorRole[] = ["public", "registered", "moderator", "admin", "reviewer"];
const ROLE_RANK: Record<NavigatorRole, number> = {
  public: 0,
  registered: 1,
  moderator: 2,
  admin: 3,
  reviewer: 0,
};

export const SECTION_PATHS: Record<MainSection, string> = {
  explore: "/",
  "use-cases": "/use-cases",
  organs: "/organs",
  events: "/events",
  docs: "/docs",
  "release-guide": "/about/release",
  "internal-docs": "/internal/docs",
  persons: "/persons",
  literature: "/literature",
  scores: "/scores",
  iconography: "/iconography",
  temperaments: "/temperaments",
  models: "/models",
  map: "/map",
  contribute: "/contribute",
  me: "/me",
  "me-contributions": "/me/contributions",
  "me-saved": "/me/saved",
  "me-notifications": "/me/notifications",
  places: "/moderation/places",
  people: "/moderation/people",
  institutions: "/moderation/buildings",
  vmi: "/virtual-instruments",
};

export const SURFACES: SurfaceDefinition[] = [
  { id: "explore", path: SECTION_PATHS.explore, label: "Explore", group: "public", requiredRole: "public", defaultDepth: "public_summary", visibility: "primary_nav", directLink: true, endpointSensitivity: "public_read" },
  { id: "use-cases", path: SECTION_PATHS["use-cases"], label: "Use Cases", group: "public", requiredRole: "public", defaultDepth: "public_summary", visibility: "primary_nav", directLink: true, endpointSensitivity: "public_read" },
  { id: "organs", path: SECTION_PATHS.organs, label: "Organs", group: "public", requiredRole: "public", defaultDepth: "public_summary", visibility: "primary_nav", directLink: true, endpointSensitivity: "public_read" },
  { id: "events", path: SECTION_PATHS.events, label: "Events", group: "public", requiredRole: "public", defaultDepth: "public_summary", visibility: "primary_nav", directLink: true, endpointSensitivity: "public_read" },
  { id: "docs", path: SECTION_PATHS.docs, label: "Documentation", group: "public", requiredRole: "public", defaultDepth: "public_summary", visibility: "primary_nav", directLink: true, endpointSensitivity: "public_read" },
  { id: "release-guide", path: SECTION_PATHS["release-guide"], label: "About the data", group: "public", requiredRole: "public", defaultDepth: "public_summary", visibility: "direct_link", directLink: true, endpointSensitivity: "public_read" },
  { id: "persons", path: SECTION_PATHS.persons, label: "People", group: "public", requiredRole: "public", defaultDepth: "public_summary", visibility: "primary_nav", directLink: true, endpointSensitivity: "public_read" },
  { id: "map", path: SECTION_PATHS.map, label: "Map", group: "public", requiredRole: "public", defaultDepth: "public_summary", visibility: "primary_nav", directLink: true, endpointSensitivity: "public_read" },
  { id: "contribute", path: SECTION_PATHS.contribute, label: "Contribute", group: "public", requiredRole: "public", defaultDepth: "user_contribution", visibility: "primary_nav", directLink: true, endpointSensitivity: "registered_user" },

  { id: "literature", path: SECTION_PATHS.literature, label: "Literature", group: "collections", requiredRole: "public", defaultDepth: "public_summary", visibility: "secondary_nav", directLink: true, endpointSensitivity: "public_read" },
  { id: "scores", path: SECTION_PATHS.scores, label: "Scores", group: "collections", requiredRole: "public", defaultDepth: "public_summary", visibility: "secondary_nav", directLink: true, endpointSensitivity: "public_read" },
  { id: "iconography", path: SECTION_PATHS.iconography, label: "Iconography", group: "collections", requiredRole: "public", defaultDepth: "public_summary", visibility: "secondary_nav", directLink: true, endpointSensitivity: "public_read" },
  { id: "temperaments", path: SECTION_PATHS.temperaments, label: "Tuning systems", group: "collections", requiredRole: "public", defaultDepth: "public_summary", visibility: "secondary_nav", directLink: true, endpointSensitivity: "public_read" },
  { id: "models", path: SECTION_PATHS.models, label: "3D Models", group: "collections", requiredRole: "public", defaultDepth: "public_summary", visibility: "hidden", directLink: true, endpointSensitivity: "public_read" },
  { id: "vmi", path: SECTION_PATHS.vmi, label: "Virtual Instruments", group: "collections", requiredRole: "public", defaultDepth: "public_summary", visibility: "secondary_nav", directLink: true, endpointSensitivity: "public_read" },

  { id: "me-contributions", path: SECTION_PATHS["me-contributions"], label: "My Contributions", group: "user", requiredRole: "registered", defaultDepth: "user_contribution", visibility: "secondary_nav", directLink: true, endpointSensitivity: "registered_user" },
  { id: "me-saved", path: SECTION_PATHS["me-saved"], label: "Saved", group: "user", requiredRole: "registered", defaultDepth: "user_contribution", visibility: "secondary_nav", directLink: true, endpointSensitivity: "registered_user" },
  { id: "me", path: SECTION_PATHS.me, label: "Profile", group: "user", requiredRole: "registered", defaultDepth: "user_contribution", visibility: "secondary_nav", directLink: true, endpointSensitivity: "registered_user" },
  { id: "me-notifications", path: SECTION_PATHS["me-notifications"], label: "Notifications", group: "user", requiredRole: "registered", defaultDepth: "user_contribution", visibility: "secondary_nav", directLink: true, endpointSensitivity: "registered_user" },

  { id: "places", path: SECTION_PATHS.places, label: "Candidate Places", group: "moderation", requiredRole: "moderator", defaultDepth: "moderation_triage", visibility: "hidden", directLink: true, endpointSensitivity: "moderator_read" },
  { id: "people", path: SECTION_PATHS.people, label: "Candidate People", group: "moderation", requiredRole: "moderator", defaultDepth: "moderation_triage", visibility: "hidden", directLink: true, endpointSensitivity: "moderator_read" },
  { id: "institutions", path: SECTION_PATHS.institutions, label: "Candidate Buildings", group: "moderation", requiredRole: "moderator", defaultDepth: "moderation_triage", visibility: "hidden", directLink: true, endpointSensitivity: "moderator_read" },
  { id: "internal-docs", path: SECTION_PATHS["internal-docs"], label: "Development Docs", group: "moderation", requiredRole: "moderator", defaultDepth: "technical_depth", visibility: "secondary_nav", directLink: true, endpointSensitivity: "moderator_read" },
];

export const PUBLIC_PRIMARY_SURFACES = SURFACES.filter((surface) => surface.group === "public" && surface.visibility === "primary_nav");
// Hidden collection routes remain directly resolvable for compatibility, but are
// not advertised as available desktop collections. 3D models intentionally stay
// in this state until their postponed viewer work resumes.
export const PUBLIC_COLLECTION_SURFACES = SURFACES.filter((surface) => surface.group === "collections" && surface.visibility === "secondary_nav");
export const REGISTERED_USER_SURFACES = SURFACES.filter((surface) => surface.group === "user");
export const MODERATOR_DIRECTORY_SURFACES = SURFACES.filter((surface) => surface.group === "moderation");

const SURFACE_CAPABILITY: Partial<Record<MainSection, string>> = {
  explore: "catalog",
  "use-cases": "catalog",
  organs: "catalog",
  events: "events",
  docs: "documentation",
  persons: "actors",
  map: "map",
  contribute: "contributions",
  literature: "literature",
  scores: "scores",
  iconography: "iconography",
  temperaments: "temperaments",
  models: "models",
  vmi: "virtual_instruments",
};

export function surfaceAvailableForCapabilities(
  surface: MainSection,
  capabilities?: readonly string[] | null,
): boolean {
  if (!capabilities) return true;
  if (surface === "release-guide") return true;
  const required = SURFACE_CAPABILITY[surface];
  return required ? capabilities.includes(required) : false;
}

export function roleAtLeast(role: NavigatorRole, required: NavigatorRole): boolean {
  if (required === "reviewer") return role === "reviewer";
  return ROLE_RANK[role] >= ROLE_RANK[required];
}

export function roleCanRead(role: NavigatorRole, required: NavigatorRole): boolean {
  if (role === "reviewer" && (required === "moderator" || required === "admin")) return true;
  return roleAtLeast(role, required);
}

export function normalizeNavigatorRole(value?: string | null): NavigatorRole {
  return ROLE_ORDER.includes(value as NavigatorRole) ? (value as NavigatorRole) : "public";
}
