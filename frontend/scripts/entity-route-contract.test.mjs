import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appUrl = new URL("../src/App.tsx", import.meta.url);

test("canonical identifier redirects preserve valid organ detail tabs", async () => {
  const app = await readFile(appUrl, "utf8");

  assert.match(
    app,
    /function identifierResolutionDestination[\s\S]*?destination\.pathname === SECTION_PATHS\.organs[\s\S]*?ORGAN_TABS\.includes\(requestedTab as OrganTab\)[\s\S]*?destination\.searchParams\.set\("tab", requestedTab\)/,
    "canonical organ resolution must carry an explicitly requested valid detail tab into the resolved organ route",
  );
  assert.match(
    app,
    /const destination = identifierResolutionDestination\(data\.pageUrl\)[\s\S]*?window\.location\.replace\(destination\)/,
    "identifier resolution must redirect through the tab-preserving destination helper",
  );
});

test("browser history closes an organ detail when it returns to the catalog route", async () => {
  const app = await readFile(appUrl, "utf8");

  assert.match(
    app,
    /const nextOrganId = routeOrganId\(\);[\s\S]*?else if \(!nextOrganId && nextSection === "organs" && selectedOrgan\) \{[\s\S]*?setSelectedOrgan\(null\)[\s\S]*?setOrganSectionLoads\(\{\}\)[\s\S]*?setActiveTab\("overview"\)/,
    "a popstate to the organ catalogue must clear the selected detail instead of leaving the old page mounted",
  );
});

test("source-scoped place identifiers use the canonical entity page", async () => {
  const app = await readFile(appUrl, "utf8");

  assert.match(
    app,
    /function isCanonicalEntityRoute[\s\S]*?normalizedId\.startsWith\("MDVS:ENTY:"\)[\s\S]*?\["places", "buildings"\]\.includes\(normalizedCategory\) && normalizedId\.startsWith\("MDVS:LOCN:"\)/,
    "MDVS:LOCN identifiers must be canonical for place and building routes",
  );
  assert.match(
    app,
    /if \(isCanonicalEntityRoute\(category, id\)\) \{\s*return \{ kind: "canonical_actor", category, id \}/,
    "decoded place routes must select the canonical actor dossier",
  );
});

test("source-scoped place pages expose established coordinates and organ links", async () => {
  const app = await readFile(appUrl, "utf8");

  assert.match(
    app,
    /const isPlace = actor\.entityType === "place" \|\| actor\.category === "places"/,
    "place dossiers must use their place-specific public presentation",
  );
  assert.match(
    app,
    /<span>Coordinates<\/span>[\s\S]*?\{coordinates\.lat\}, \{coordinates\.lon\}[\s\S]*?<a href="\/map">Open map<\/a>/,
    "established canonical coordinates must be visible and linked to the map",
  );
  assert.match(
    app,
    /function ActorRelationshipGroups[\s\S]*?const relatedUrl = relationship\.relatedUrl \|\| relationship\.entityPageUrl[\s\S]*?relatedKind === "Organ" \|\| relatedKind === "organ"/,
    "place-to-organ relationships must use their canonical organ URL and label",
  );
});

test("canonical relationships use bounded progressive groups", async () => {
  const app = await readFile(appUrl, "utf8");

  assert.match(
    app,
    /const key = `\$\{direction\}:\$\{relationType\.toLocaleLowerCase\(\)\}`[\s\S]*?targets: new Map/,
    "relationship links must be grouped by relation type and direction, then deduplicated by target",
  );
  assert.match(
    app,
    /const visibleItems = group\.items\.slice\(0, visibleCount\)[\s\S]*?aria-expanded=\{open\}/,
    "relationship groups must be collapsible and render only the current progressive window",
  );
  assert.match(
    app,
    /const ACTOR_RELATIONSHIP_BATCH_SIZE = 12[\s\S]*?visibleCounts\[group\.key\] \|\| ACTOR_RELATIONSHIP_BATCH_SIZE/,
    "large relationship groups must reveal links in bounded batches",
  );
  assert.match(
    app,
    /actorRelationshipMatches[\s\S]*?Search relationships[\s\S]*?Person, organization, place, organ, city, country/,
    "relationship search must cover connected entities and their geographical context",
  );
  assert.match(
    app,
    /actorRelationshipLocationSections[\s\S]*?actor-relationship-country[\s\S]*?actor-relationship-city/,
    "place-backed relationships must be grouped by country and city",
  );
  assert.match(
    app,
    /<ActorRelationshipGroups[\s\S]*?relationships=\{relationships\}[\s\S]*?staffMode=\{staffMode\}/,
    "canonical actor pages must render the grouped relationship component",
  );
  assert.match(
    app,
    /setMentionsOpen\(true\)[\s\S]*?Inspect \$\{actor\.sourceRecordCount\} documented mentions[\s\S]*?actor\.collectionDelivery\?\.scope \? "Builder source records" : "Mentions"/,
    "actor support counts must retain inspection and qualify the bounded builder collection",
  );
  assert.match(
    app,
    /function ActorMentionsModal[\s\S]*?distinct supporting record[\s\S]*?It is not a separate data provider[\s\S]*?Search mentions/,
    "the mentions action must explain, group, and search supporting source records",
  );
});

test("organ history and activities provide distinct chronological and analytical views", async () => {
  const app = await readFile(appUrl, "utf8");

  assert.match(
    app,
    /Chronological history[\s\S]*?history attached to this organ record[\s\S]*?do not by themselves prove uninterrupted material identity/,
    "history must explain its source-scoped chronological and material-identity limits",
  );
  assert.match(
    app,
    /Work and participants[\s\S]*?organized by controlled activity type where a mapping exists[\s\S]*?source-only wording remains visibly separate[\s\S]*?activityGroups\.map/,
    "activities must distinguish controlled mappings from source-only wording in the participant-oriented view",
  );
  assert.match(
    app,
    /timeline-source-attributions[\s\S]*?Source[\s\S]*?sourceAttributions\.map/,
    "every event card must expose restrained source attribution when it is available",
  );
  assert.match(
    app,
    /Event evidence[\s\S]*?Other source assertions remain independently attributed[\s\S]*?Aggregate year or label assertions are not guessed into one-to-one event alignments/,
    "event conflicts must remain source-attributed and must not imply unsupported event alignment",
  );
});
