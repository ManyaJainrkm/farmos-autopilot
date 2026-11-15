# FarmOS Autopilot

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
