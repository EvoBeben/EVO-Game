#!/usr/bin/env python3
"""Refresh the static Sleeper projection snapshot used by the merged player lab."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen


ENDPOINT = "https://api.sleeper.com/projections/nfl/2026?season_type=regular&order_by=pts_ppr"
FANTASY_POSITIONS = {"QB", "RB", "WR", "TE", "K", "DEF"}
OUTPUT = Path(__file__).with_name("data") / "sleeper-projections-2026.json"


def main() -> None:
    request = Request(ENDPOINT, headers={"User-Agent": "EVO-Game data refresh"})
    with urlopen(request, timeout=60) as response:
        records = json.load(response)

    players = []
    for record in records:
        player = record.get("player") or {}
        stats = record.get("stats") or {}
        position = player.get("position")
        if position not in FANTASY_POSITIONS or float(stats.get("pts_ppr") or 0) <= 0:
            continue
        players.append(
            {
                "player_id": record.get("player_id"),
                "name": " ".join(
                    part for part in (player.get("first_name"), player.get("last_name")) if part
                ),
                "position": position,
                "team": record.get("team") or player.get("team"),
                "years_exp": player.get("years_exp"),
                "injury_status": player.get("injury_status"),
                "injury_body_part": player.get("injury_body_part"),
                "injury_notes": player.get("injury_notes"),
                "injury_start_date": player.get("injury_start_date"),
                "stats": stats,
                "updated_at": record.get("updated_at"),
            }
        )

    players.sort(key=lambda item: float(item["stats"].get("pts_ppr") or 0), reverse=True)
    payload = {
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "source": ENDPOINT,
        "provider": "Sleeper API / Rotowire projection feed",
        "scope": "All QB, RB, WR, TE, K and DEF records with a positive full-PPR projection",
        "playerCount": len(players),
        "players": players,
    }
    OUTPUT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(players)} projections to {OUTPUT}")


if __name__ == "__main__":
    main()
