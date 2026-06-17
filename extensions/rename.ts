import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isOrgmExtensionEnabled } from "./lib/orgm-extension-config.ts";

export const PI_RENAME_EVENT = "pi-rename:name-changed";
export const PI_RENAME_ENTRY_TYPE = "pi-rename:session-name";

const MAX_NAME_WIDTH = 60;

function sanitizeName(input: string): string {
	return input
		.replace(/[\r\n\t]+/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, MAX_NAME_WIDTH)
		.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractLastName(ctx: ExtensionContext): string {
	const entries = ctx.sessionManager.getEntries();
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		if (entry?.type !== "custom") continue;
		if ((entry as { customType?: string }).customType !== PI_RENAME_ENTRY_TYPE) continue;
		const data = (entry as { data?: unknown }).data;
		if (isRecord(data) && typeof data.name === "string") {
			return sanitizeName(data.name);
		}
	}
	return "";
}

export default function renameExtension(pi: ExtensionAPI) {
	if (!isOrgmExtensionEnabled("rename")) return;

	let currentName = "";

	const applyName = (name: string) => {
		currentName = name;
		pi.events.emit(PI_RENAME_EVENT, { name });
	};

	pi.on("session_start", async (_event, ctx) => {
		const saved = extractLastName(ctx);
		currentName = saved;
		pi.events.emit(PI_RENAME_EVENT, { name: saved });
	});

	pi.on("session_shutdown", async () => {
		currentName = "";
	});

	pi.registerCommand("orgm-rename", {
		description: "Set session label shown in editor footer: /orgm-rename <label> | clear",
		getArgumentCompletions: (prefix) => {
			const options = [
				{ value: "clear", label: "clear — remove current session name" },
			];
			if (currentName) {
				options.unshift({ value: currentName, label: `"${currentName}" — current name (re-apply)` });
			}
			const value = prefix.trimStart().toLowerCase();
			return options.filter((o) => o.value.toLowerCase().startsWith(value));
		},
		handler: async (args, ctx) => {
			const trimmed = args.trim();

			if (!trimmed) {
				ctx.ui.notify(
					currentName ? `Session name: ${currentName}` : "No session name. Use /orgm-rename <name>.",
					"info",
				);
				return;
			}

			if (trimmed.toLowerCase() === "clear") {
				pi.appendEntry(PI_RENAME_ENTRY_TYPE, { name: "" });
				applyName("");
				ctx.ui.notify("Session name cleared.", "info");
				return;
			}

			const clean = sanitizeName(trimmed);
			if (!clean) {
				ctx.ui.notify("Name is empty after sanitizing.", "warning");
				return;
			}

			pi.appendEntry(PI_RENAME_ENTRY_TYPE, { name: clean });
			applyName(clean);
			ctx.ui.notify(`Session name: ${clean}`, "success");
		},
	});
}
