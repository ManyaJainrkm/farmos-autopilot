"""OpenAI Responses adapter for the simulated fleet."""

import json
from urllib.request import Request, urlopen


ASSIGN_TRACTOR = {
    "type": "function",
    "name": "assign_tractor",
    "description": (
        "Request a simulated tractor assignment to a work zone. "
        "Use only when the operator directly requests a change. "
        "The simulator validates and applies the request."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "tractor": {"type": "string", "enum": ["01", "02", "03", "04", "05"]},
            "field": {"type": "string", "enum": ["A", "B", "C", "D"]},
        },
        "required": ["tractor", "field"],
        "additionalProperties": False,
    },
    "strict": True,
}


def ask_openai(api_key, model, question, farm, assignment):
    instructions = (
        "You are FarmOS for a simulated tractor fleet. Answer farm questions in one or two "
        "short sentences using the supplied snapshot. Completed zones need no tractor. "
        "Do not invent sensor readings or weather. If a direct assignment request and an "
        "authorized tractor ID and field ID are provided, call assign_tractor with those "
        "exact IDs. Never claim a change has happened before the simulator applies it."
    )
    context = {"farm": farm, "authorized_assignment": assignment}
    payload = {
        "model": model,
        "store": False,
        "instructions": instructions,
        "input": json.dumps({"question": question, "context": context}),
        "max_output_tokens": 420,
    }
    if assignment:
        payload.update(tools=[ASSIGN_TRACTOR], tool_choice="auto", parallel_tool_calls=False)
    if model.startswith("gpt-5"):
        payload["reasoning"] = {"effort": "low"}

    request = Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    )
    with urlopen(request, timeout=8) as response:
        output = json.load(response)["output"]
    for item in output:
        if item.get("type") == "function_call" and item.get("name") == "assign_tractor":
            args = json.loads(item["arguments"])
            if assignment and args == assignment:
                return {"assignment": args, "provider": "openai"}
    answer = " ".join(
        part["text"]
        for item in output if item.get("type") == "message"
        for part in item["content"] if part.get("type") == "output_text"
    ).strip()
    if answer and not assignment:
        return {"answer": answer[:650], "provider": "openai"}
    return None
