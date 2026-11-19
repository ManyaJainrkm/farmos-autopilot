# FarmOS Autopilot

> **Portfolio fork.** This is Manya Jain's copy of [dhanush17-tech/farmos-autopilot](https://github.com/dhanush17-tech/farmos-autopilot), our team's entry for **AgX Arizona Track 2, "Run the Fleet"** (presented by American Tractor Company) at Hack Arizona, 15 November 2026. The FarmOS app code in this repository was written by Dhanush; the commit history is his. This section describes my part of the project.

## The challenge

Build a coordinator that assigns jobs to a small fleet of simulated autonomous tractors and re-plans when conditions change: take an operator's job list, assign compatible tractors (implements, fuel or battery, deadlines), show progress on a map, recover from a breakdown without conflicting assignments or lost work, and explain the new plan in plain language. Judged on a 3-minute live demo.

## Team

| Person | Role |
| --- | --- |
| Manya Jain | Concept and orchestration design; orchestration layer in the backup build; demo script and judge Q&A |
| Dhanush | Built FarmOS Autopilot, this app |
| Malaika Khan | Built FleetPhoenix, the backup build |
| Bhoomi | Presentation |

## My contributions (Manya Jain)

### The idea: break the truck, watch the fleet recover

I proposed the core of our demo: **let the judges break a tractor themselves** and watch the agents re-plan live, with no lost work and no tractor double-booked. I extended it to **"break the AI"**: deliberately make an agent fail and show the system still recovers safely.

### The orchestration pipeline

I wrote the AI orchestration plan the team built from:

- **Specialist agents, one job each:** Intake (parses the job list, flags missing fields), a Tractor agent per tractor (bids for work), Dispatcher/Planner (awards jobs), Verifier (checks every rule), Monitor (raises breakdowns) and Communicator (explains plans), coordinated by an Orchestrator.
- **Bid → award → verify → commit:** tractors bid in parallel, the Planner awards, a deterministic Verifier must pass the plan, and only then is it applied.
- **Never stop the fleet:** per-agent timeouts, a retry, then a deterministic fallback planner when an agent fails.
- **No lost work:** progress checkpoints, so a backup resumes exactly where the broken tractor stopped.
- **Proof, not claims:** 10 chaos test scenarios (breakdowns, all tractors down, impossible deadlines, a hallucinated tractor, a missing deadline in the job list).
- The API contract and screen brief for the dashboard.

FarmOS's Tractor Agent → Memory Agent (row checkpoint) → Dispatch Agent handoff follows this design.

### Backup build: FleetPhoenix, with Malaika

To make sure the demo couldn't fail on the day, Malaika and I kept a second, independent implementation, [MalaikaKamranKhan/FleetPhoenix](https://github.com/MalaikaKamranKhan/FleetPhoenix). On top of Malaika's app I built the orchestration layer:

- [PR #1](https://github.com/MalaikaKamranKhan/FleetPhoenix/pull/1): parallel tractor-agent bidding with timeouts; a Constraint Guard that blocks invalid plans; retry and a deterministic fallback planner with a circuit breaker; a **Break the AI** button; progress checkpoints the Guard enforces; a remembered battery-reserve rule; operator CSV job-list upload with an Intake agent that flags problems instead of guessing; plain-language plan explanations; a **live test board** that runs the scenarios on fresh simulated farms
- [PR #3](https://github.com/MalaikaKamranKhan/FleetPhoenix/pull/3): auto-recovery (field repairs, returning signal, recharging), so a judge's sabotage can never stall the demo
- [PR #4](https://github.com/MalaikaKamranKhan/FleetPhoenix/pull/4): a read-only feed of one tractor's simulated GPS (NMEA over UDP) into the official AgOpenWeb guidance app

44 automated tests and 14 of 14 live scenarios pass.

### Integration and demo

- Set up the official open-source **AgOpenWeb** guidance app on the demo laptop and verified it receiving our simulated GPS (RTK Fixed)
- Wrote the 3-minute demo script, split across four speakers, with our mascot **Old MacDonald**: Old MacDonald had a farm, E-I-E-I-O, *Every Implementation, Every Instinct, Orchestrated*. Now he has a fleet.
- Prepared the judge Q&A, checked against the code

---

*Dhanush's original README follows.*

FarmOS coordinates five simulated tractors in four work zones on one parcel near Marana, Arizona. The Satellite tab uses an overhead or perspective view of USDA/USGS aerial imagery. Each tractor has a follow camera. The AgOpenWeb tab embeds official guidance and consumes one selected synthetic GPS feed. The fleet view defaults to sending Atlas initially, then the backup after dispatch.

## Start the live demo locally

1. Download and unpack or install the official [AgOpenWeb beta](https://github.com/AgOpenGPS-Official/AgOpenWeb/releases/tag/beta).
2. From this folder, run `python3 prepare_agopenweb.py .demo-data` with AgOpenWeb stopped.
3. Start the upstream host with the dedicated profile. On Apple Silicon with the app in Applications, run:

   ```sh
   AGOPENWEB_DATA="$PWD/.demo-data" /Applications/AgOpenWeb.app/Contents/MacOS/AgOpenWeb.Desktop --headless
   ```

4. In another terminal, run `python3 demo_server.py` and open [the local demo](http://127.0.0.1:4173/).
5. Switch to **AgOpenWeb** and choose **Field Operations → Fields and Jobs → Sonoran Fleet Plot → Open Field Only**. The profile starts with AgOpenWeb's internal simulator disabled so it accepts FarmOS's synthetic fixes over UDP 9999. Leave autosteer and sections off. Use the up arrow to set the camera to overhead if needed.

The hosted FarmOS page includes the satellite fleet view and orchestration panel. The official live guidance tab uses the two local processes above. The imagery is bundled for offline presentation. The work zones, routes and GPS positions are simulated over that imagery. [USGS imagery source](https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer).

## Judge demo

1. Start from the ready view. Atlas is exactly halfway through row 7 in North Field.
2. Hand the judge **Simulate breakdown**. Atlas goes offline immediately and Ranger is dispatched. From the entire-plot view, follow the dashed route or select **Ranger** under **Tractor views**. Watch the on-map countdown as Ranger travels about 55 seconds to the checkpoint, then continues row 7. The default run takes about 90 seconds from breakdown to completion. One simulated minute plays in nine seconds.
3. Watch **Activity**. The tractor outage appears first, followed by Memory Agent’s checkpoint and Tractor Agent’s decision. Ranger turns bright green and its backup route appears on the map.
4. Try **Ask FarmOS** with “What is Scout doing?”, “Assign Ranger to North Field”, or “Remember fuel reserve 20 liters”. The microphone captures a transcript for review in compatible browsers. Fuel preferences and the last failure checkpoint survive reload and reset.

Ask FarmOS can answer natural-language questions about estimated finish times, unfinished rows, fuel, compatible backup tractors, and the latest handoff. It keeps the recent tractor or zone in context for follow-up questions. Supported farm questions work on the hosted page. If a local model is configured, the local demo also asks it to answer open-ended questions using a snapshot of the simulation. The model can only return text. Use explicit commands or the form to change assignments.

### Connect OpenAI to Ask FarmOS

Set `OPENAI_API_KEY` as an environment variable in the terminal that starts `python3 demo_server.py`. The default model is `gpt-5-mini`. Use `FARMOS_OPENAI_MODEL` to override it. Keep the API key on the server and out of the browser and Git. The hosted static page runs the built-in commands and farm answers. OpenAI requests use the local backend.

The OpenAI model receives the five simulated tractors’ current statuses, equipment, fuel, work zones and latest handoff. When the operator clearly requests one assignment with a named tractor and zone, it can call `assign_tractor`. The browser checks the proposal against the original request and runs the simulator’s normal equipment, availability and reserve checks. The chat confirms the actual result returned by the simulator. If OpenAI is unavailable, supported commands still run locally. “Put Ranger on the north fields” assigns Ranger and starts the simulation so you can see it travel.

To set up from scratch, expand **Assign tractors**, choose **Start a blank plan**, and select a tractor and work zone. Incompatible equipment and assignments that would breach the saved fuel reserve are rejected. **Reset demo** restores the ready-made breakdown scenario.

The map fills the workspace. **Activity** shows each tractor's current simulated telemetry, transitions and agent decisions. Filter by tractor or choose **Agents only**. On interruption, Tractor Agent inspects the fleet, Memory Agent saves and returns the exact row checkpoint and reserve, Tractor Agent scores eligible assignments, and Dispatch Agent applies the selected handoff. Each step is shown as it runs, with short waits for the demo. The model summarizes after dispatch.

To plug in your own model, launch the local relay with `FARMOS_MODEL_COMMAND='/absolute/path/to/your-model-adapter'`. The executable receives a short prompt and simulated decision JSON on stdin and returns one sentence on stdout. The model summary runs after dispatch, reports its own latency, and times out after four seconds. The telemetry, planner, and dispatch stages run deterministically.

The assignment search preserves active assignments, rejects incompatible implements and inadequate reserves on new assignments, and scores standby dispatch alternatives. Row coverage is a fractional checkpoint. This is a deterministic simulation with a supported set of operator commands.

## AgOpenGPS replay

The live AgOpenWeb tab uses the selected tractor's NMEA feed. The standalone `replay.py` script can replay an existing NMEA recording into a local AgIO receiver. See [AgOpenGPS networking](https://docs.agopengps.com/hardware/networking/).
