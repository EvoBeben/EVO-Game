import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const html = await readFile(new URL("index.html", root), "utf8");
const rankings = JSON.parse(await readFile(new URL("data/rankings-2026.json", root), "utf8"));
const projections = JSON.parse(await readFile(new URL("data/sleeper-projections-2026.json", root), "utf8"));
const teams = JSON.parse(await readFile(new URL("data/team-reports-2026.json", root), "utf8"));

test("uses honest projection, injury, history, and freshness labels", () => {
  assert.doesNotMatch(html, /Projected games/i);
  assert.doesNotMatch(html, /Estimated return/i);
  assert.doesNotMatch(html, /real career stats for every player/i);
  assert.doesNotMatch(html, /6 August 2026/i);
  assert.match(html, /Projection horizon/);
  assert.match(html, /Planning outlook/);
  assert.match(html, /source-rankings-date/);
  assert.match(html, /source-projections-date/);
  assert.match(html, /source-team-date/);
});

test("includes persistent drafted and queue controls", () => {
  assert.match(html, /id="lab-availability"/);
  assert.match(html, /id="draft-queue"/);
  assert.match(html, /id="drafted-count"/);
  assert.match(html, /draft-desk-2026-state-v1/);
  assert.match(html, /class="queue-toggle"/);
  assert.match(html, /class="draft-toggle"/);
  assert.match(html, /localStorage\.setItem/);
});

test("keeps the merged data contracts intact", () => {
  assert.equal(rankings.players.length, 144);
  assert.equal(projections.playerCount, projections.players.length);
  assert.ok(projections.players.length >= 500, "projection feed unexpectedly small");
  assert.equal(teams.teams.length, 32);
  assert.ok(rankings.lastUpdated);
  assert.ok(projections.fetchedAt);
  assert.ok(teams.lastUpdated);
  assert.equal(new Set(teams.teams.map((team) => team.abbr)).size, 32);
});

test("keeps ids, aria references, and inline JavaScript valid", () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, "duplicate HTML id found");
  const controls = [...html.matchAll(/\baria-controls="([^"]+)"/g)].flatMap((match) => match[1].split(/\s+/));
  for (const id of controls) assert.ok(ids.includes(id), `aria-controls points to missing #${id}`);

  const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((match) => !/application\/json/i.test(match[1]))
    .map((match) => match[2]);
  assert.ok(scripts.length >= 3);
  for (const source of scripts) assert.doesNotThrow(() => new Function(source));
});
