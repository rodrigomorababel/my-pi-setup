import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const BABEL_MODEL_ID = "Babel-LLM";
const BABEL_SAMPLERS = {
	temperature: 1.0,
	top_p: 0.95,
	top_k: 40,
};

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export default function (pi: ExtensionAPI) {
	pi.on("before_provider_request", (event) => {
		if (!isObject(event.payload)) return;
		if (event.payload.model !== BABEL_MODEL_ID) return;

		return {
			...event.payload,
			...BABEL_SAMPLERS,
		};
	});
}
