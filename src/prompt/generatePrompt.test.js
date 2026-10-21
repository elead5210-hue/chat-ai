import { describe, it, expect } from "vitest";
import {
  BOUNDARIES_PHASE_INSTRUCTION,
  CONTEXT_PHASE_INSTRUCTION,
  DEFAULT_INSTRUCTION,
  generatePrompt,
  generatePromptSections,
} from "./generatePrompt.js";
import { COMPONENT_CATALOG } from "./componentCatalog.js";
import {
  COMPONENT_TYPES,
  PROTOCOL_NAME,
  PROTOCOL_VERSION,
  OPTIONAL_RESPONSE_FIELDS,
  RESPONSE_FIELDS,
  RESPONSE_SCHEMA_RULES,
} from "../protocol/schema.js";
import { buildContextPackage } from "../context/contextPackage.js";
import {
  WELCOME_MESSAGE,
  appendAssistantMessage,
  appendUserMessage,
  createConversation,
} from "../state/conversationStore.js";

const SNAPSHOT = {
  conversation_id: "conv-test",
  context_version: 3,
  summary: "User wants to plan a trip.",
  decisions: ["Use React"],
  user_preferences: { travel_style: "Comfort" },
  current_state: { step: "choose_dates" },
  open_questions: ["What is the budget?"],
};

describe("generatePromptSections", () => {
  it("returns every section with sensible defaults when called with no input", () => {
    const sections = generatePromptSections();

    expect(sections.instruction).toBe(DEFAULT_INSTRUCTION.trim());
    expect(sections.context).toMatch(/No context yet/);
    expect(sections.conversation).toMatch(/No messages yet/);
    expect(sections.uiState).toMatch(/not filled in any fields/);
    expect(typeof sections.availableComponents).toBe("string");
    expect(typeof sections.responseSchema).toBe("string");
  });

  it("uses a custom instruction", () => {
    const sections = generatePromptSections({
      instruction: "  Help the user plan a 7-day holiday.  ",
    });
    expect(sections.instruction).toBe("Help the user plan a 7-day holiday.");
  });

  it("falls back to the default instruction when the custom one is blank", () => {
    for (const instruction of ["", "   ", null, undefined, 42]) {
      const sections = generatePromptSections({ instruction });
      expect(sections.instruction).toBe(DEFAULT_INSTRUCTION.trim());
    }
  });

  it("renders the context as a Context Package", () => {
    const sections = generatePromptSections({ context: SNAPSHOT });

    expect(sections.context).toBe(buildContextPackage(SNAPSHOT));
    expect(sections.context).toContain("CONTEXT PACKAGE");
    expect(sections.context).toContain("Conversation: conv-test");
    expect(sections.context).toContain("Summary:\nUser wants to plan a trip.");
    expect(sections.context).toContain("1. Use React");
    expect(sections.context).toContain("- travel_style: Comfort");
    expect(sections.context).toContain("- step: choose_dates");
    expect(sections.context).toContain("1. What is the budget?");
  });

  it("does not embed the context as raw JSON", () => {
    const { context } = generatePromptSections({ context: SNAPSHOT });

    expect(() => JSON.parse(context)).toThrow();
    expect(context).not.toContain('"summary"');
    expect(context).not.toContain('"decisions"');
    expect(context).not.toContain("user_preferences");
  });

  it("omits empty context sections", () => {
    const { context } = generatePromptSections({
      context: { conversation_id: "conv-test", summary: "Just a summary." },
    });

    expect(context).toContain("Summary:\nJust a summary.");
    expect(context).not.toContain("Important decisions:");
    expect(context).not.toContain("User preferences:");
    expect(context).not.toContain("Current state:");
    expect(context).not.toContain("Outstanding questions:");
  });

  it("treats context without snapshot fields as empty", () => {
    const { context } = generatePromptSections({ context: { goal: "Plan a trip" } });
    expect(context).toMatch(/No context yet/);
    expect(context).not.toContain("Plan a trip");
  });

  it("prefixes the context package with a fingerprint when one is supplied", () => {
    const sections = generatePromptSections({
      context: SNAPSHOT,
      contextFingerprint: "CTX-7F92A1",
    });
    expect(sections.context.startsWith("Context fingerprint: CTX-7F92A1\n")).toBe(true);
    expect(sections.context).toBe(
      `Context fingerprint: CTX-7F92A1\n${buildContextPackage(SNAPSHOT)}`
    );
  });

  it("leaves the context package unprefixed when no fingerprint is supplied", () => {
    const sections = generatePromptSections({ context: SNAPSHOT });
    expect(sections.context).not.toContain("Context fingerprint");
    expect(sections.context.startsWith("CONTEXT PACKAGE")).toBe(true);
  });

  it("formats the conversation with speaker labels", () => {
    const sections = generatePromptSections({
      messages: [
        { role: "assistant", content: "What would you like to work on?" },
        { role: "user", content: "I want to plan a trip." },
      ],
    });
    expect(sections.conversation).toBe(
      "Assistant: What would you like to work on?\nUser: I want to plan a trip."
    );
  });

  it("leaves Nexus's own welcome message out of the conversation", () => {
    const sections = generatePromptSections({ messages: createConversation() });

    expect(sections.conversation).toMatch(/No messages yet/);
    expect(sections.conversation).not.toContain(WELCOME_MESSAGE.content);
    expect(sections.conversation).not.toContain("Assistant:");
  });

  it("keeps user messages and relayed AI replies but drops the welcome message", () => {
    let messages = createConversation();
    messages = appendUserMessage(messages, "I want to plan a trip.");
    messages = appendAssistantMessage(messages, "Where would you like to go?");
    messages = appendUserMessage(messages, "Somewhere warm.");

    const { conversation } = generatePromptSections({ messages });

    expect(conversation).toBe(
      [
        "User: I want to plan a trip.",
        "Assistant: Where would you like to go?",
        "User: Somewhere warm.",
      ].join("\n")
    );
  });

  it("keeps an AI reply that happens to repeat the welcome text", () => {
    const messages = appendAssistantMessage(createConversation(), WELCOME_MESSAGE.content);

    const { conversation } = generatePromptSections({ messages });

    expect(conversation).toBe(`Assistant: ${WELCOME_MESSAGE.content}`);
  });

  it("does not change the messages it is given", () => {
    const messages = appendUserMessage(createConversation(), "Hello");
    const copy = [...messages];

    generatePromptSections({ messages });

    expect(messages).toEqual(copy);
    expect(messages[0]).toBe(WELCOME_MESSAGE);
  });

  it("describes Nexus as the structured interface in the default instruction", () => {
    expect(DEFAULT_INSTRUCTION).toContain("Nexus");
    expect(DEFAULT_INSTRUCTION).toMatch(/structured interface between a user and an AI/);
    expect(generatePromptSections().instruction).toContain("Nexus");
  });

  it("serialises UI state as JSON", () => {
    const uiState = { departure_date: "2026-12-01", international: true };
    const sections = generatePromptSections({ uiState });
    expect(JSON.parse(sections.uiState)).toEqual(uiState);
  });

  it("lists all available component types", () => {
    const sections = generatePromptSections();
    const parsed = JSON.parse(sections.availableComponents);
    expect(parsed.available_components).toEqual(COMPONENT_TYPES);
  });

  it("describes every component with fields and an example", () => {
    const sections = generatePromptSections();
    const parsed = JSON.parse(sections.availableComponents);

    expect(parsed.common_fields).toBeTruthy();
    expect(typeof parsed.option_format).toBe("string");
    expect(parsed.components.map((c) => c.type)).toEqual(
      COMPONENT_CATALOG.map((entry) => entry.type)
    );
    for (const component of parsed.components) {
      expect(typeof component.description).toBe("string");
      expect(Array.isArray(component.required_fields)).toBe(true);
      expect(Array.isArray(component.optional_fields)).toBe(true);
      expect(component.example.type).toBe(component.type);
    }
  });

  it("includes every schema rule and a valid example", () => {
    const { responseSchema } = generatePromptSections();

    RESPONSE_SCHEMA_RULES.forEach((rule, index) => {
      expect(responseSchema).toContain(`${index + 1}. ${rule}`);
    });

    expect(responseSchema).toContain(`"protocol": "${PROTOCOL_NAME}"`);
    expect(responseSchema).toContain(`"version": "${PROTOCOL_VERSION}"`);
    expect(responseSchema).toContain('"next_action"');
  });

  it("lists every protocol field with its required flag, type and meaning", () => {
    const { responseSchema } = generatePromptSections();

    expect(RESPONSE_FIELDS.map((field) => field.name)).toEqual([
      "protocol",
      "version",
      "message",
      "components",
      "context_updates",
      "state_updates",
      "next_action",
    ]);

    for (const field of RESPONSE_FIELDS) {
      const flag = field.required ? "required" : "optional";
      expect(responseSchema).toContain(
        `- ${field.name} (${flag}, ${field.type}): ${field.description}`
      );
    }
  });

  it("marks every v1 field as required and every optional field as optional", () => {
    const { responseSchema } = generatePromptSections();
    const lines = responseSchema.split("\n").filter((line) => line.startsWith("- "));

    expect(lines).toHaveLength(RESPONSE_FIELDS.length + OPTIONAL_RESPONSE_FIELDS.length);
    lines.slice(0, RESPONSE_FIELDS.length).forEach((line) => {
      expect(line).toMatch(/^- [a-z_]+ \(required, /);
    });
    lines.slice(RESPONSE_FIELDS.length).forEach((line) => {
      expect(line).toMatch(/^- [a-z_]+ \(optional, /);
    });
  });

  it("lists the phase_complete field as optional", () => {
    const { responseSchema } = generatePromptSections();
    expect(responseSchema).toMatch(/- phase_complete \(optional, boolean\):/);
  });

  it("puts the field list before the rules and the rules before the example", () => {
    const { responseSchema } = generatePromptSections();

    const fieldsIndex = responseSchema.indexOf("Fields:");
    const rulesIndex = responseSchema.indexOf("Rules:");
    const exampleIndex = responseSchema.indexOf("Example of a valid response:");

    expect(fieldsIndex).toBe(0);
    expect(rulesIndex).toBeGreaterThan(fieldsIndex);
    expect(exampleIndex).toBeGreaterThan(rulesIndex);

    const lastFieldIndex = responseSchema.indexOf(
      `- ${RESPONSE_FIELDS[RESPONSE_FIELDS.length - 1].name} (`
    );
    expect(lastFieldIndex).toBeGreaterThan(fieldsIndex);
    expect(lastFieldIndex).toBeLessThan(rulesIndex);
  });

  it("lists the fields in the order the protocol defines them", () => {
    const { responseSchema } = generatePromptSections();
    let lastIndex = -1;

    for (const field of RESPONSE_FIELDS) {
      const index = responseSchema.indexOf(`- ${field.name} (`);
      expect(index, `missing field ${field.name}`).toBeGreaterThan(lastIndex);
      lastIndex = index;
    }
  });

  it("does not depend on the context, messages or UI state", () => {
    const empty = generatePromptSections().responseSchema;
    const filled = generatePromptSections({
      instruction: "Something else.",
      context: SNAPSHOT,
      messages: [{ role: "user", content: "Hello" }],
      uiState: { budget: 1 },
    }).responseSchema;

    expect(filled).toBe(empty);
  });
});

describe("phase-specific instructions", () => {
  it("uses the phase one instruction for the boundaries phase", () => {
    const sections = generatePromptSections({ phase: "boundaries" });
    expect(sections.instruction).toBe(BOUNDARIES_PHASE_INSTRUCTION.trim());
    expect(sections.instruction).toMatch(/PHASE ONE/);
    expect(sections.instruction).toMatch(/boundaries of the document/);
  });

  it("uses the phase two instruction for the context phase", () => {
    const sections = generatePromptSections({ phase: "context" });
    expect(sections.instruction).toBe(CONTEXT_PHASE_INSTRUCTION.trim());
    expect(sections.instruction).toMatch(/PHASE TWO/);
    expect(sections.instruction).toMatch(/context needed/);
  });

  it("gives each phase its own instruction text", () => {
    expect(BOUNDARIES_PHASE_INSTRUCTION).not.toBe(CONTEXT_PHASE_INSTRUCTION);
    expect(BOUNDARIES_PHASE_INSTRUCTION).not.toBe(DEFAULT_INSTRUCTION);
    expect(CONTEXT_PHASE_INSTRUCTION).not.toBe(DEFAULT_INSTRUCTION);
  });

  it("tells the AI to signal phase_complete in phase one, not conversation_complete", () => {
    expect(BOUNDARIES_PHASE_INSTRUCTION).toContain("phase_complete");
    expect(BOUNDARIES_PHASE_INSTRUCTION).toMatch(/Do not set conversation_complete/);
  });

  it("tells the AI to signal conversation_complete in phase two", () => {
    expect(CONTEXT_PHASE_INSTRUCTION).toContain("conversation_complete");
    expect(CONTEXT_PHASE_INSTRUCTION).toContain('next_action to "complete"');
  });

  it("keeps the default instruction when no phase is given", () => {
    expect(generatePromptSections().instruction).toBe(DEFAULT_INSTRUCTION.trim());
    expect(generatePromptSections({ phase: null }).instruction).toBe(DEFAULT_INSTRUCTION.trim());
  });

  it("keeps the default instruction for an unknown phase", () => {
    const sections = generatePromptSections({ phase: "unknown" });
    expect(sections.instruction).toBe(DEFAULT_INSTRUCTION.trim());
  });

  it("uses the phase instruction when the default instruction is passed explicitly", () => {
    const sections = generatePromptSections({
      instruction: DEFAULT_INSTRUCTION,
      phase: "context",
    });
    expect(sections.instruction).toBe(CONTEXT_PHASE_INSTRUCTION.trim());
  });

  it("uses the phase instruction when the instruction is blank", () => {
    const sections = generatePromptSections({ instruction: "   ", phase: "boundaries" });
    expect(sections.instruction).toBe(BOUNDARIES_PHASE_INSTRUCTION.trim());
  });

  it("lets a custom instruction win over the phase instruction", () => {
    for (const phase of ["boundaries", "context"]) {
      const sections = generatePromptSections({
        instruction: "Help the user plan a 7-day holiday.",
        phase,
      });
      expect(sections.instruction).toBe("Help the user plan a 7-day holiday.");
    }
  });

  it("puts the phase instruction in the generated prompt", () => {
    const phaseOne = generatePrompt({ phase: "boundaries" });
    const phaseTwo = generatePrompt({ phase: "context" });

    expect(phaseOne).toContain(BOUNDARIES_PHASE_INSTRUCTION.trim());
    expect(phaseOne).not.toContain(CONTEXT_PHASE_INSTRUCTION.trim());
    expect(phaseTwo).toContain(CONTEXT_PHASE_INSTRUCTION.trim());
    expect(phaseTwo).not.toContain(BOUNDARIES_PHASE_INSTRUCTION.trim());
  });

  it("does not change the response schema between phases", () => {
    const one = generatePromptSections({ phase: "boundaries" }).responseSchema;
    const two = generatePromptSections({ phase: "context" }).responseSchema;
    expect(one).toBe(two);
  });
});

describe("checklist", () => {
  const CHECKLIST = [
    { id: "audience", label: "Who the document is for", satisfied: true },
    { id: "scope", label: "What the document covers", satisfied: false },
  ];

  it("has no checklist section when there is no checklist", () => {
    expect(generatePromptSections().checklist).toBeNull();
    expect(generatePromptSections({ checklist: [] }).checklist).toBeNull();
    expect(generatePromptSections({ checklist: null }).checklist).toBeNull();
    expect(generatePromptSections({ checklist: "x" }).checklist).toBeNull();
  });

  it("serialises the checklist as JSON with id, label and satisfied", () => {
    const sections = generatePromptSections({ checklist: CHECKLIST });
    expect(JSON.parse(sections.checklist)).toEqual(CHECKLIST);
  });

  it("only includes id, label and satisfied for each item", () => {
    const sections = generatePromptSections({
      checklist: [{ id: "a", label: "A", satisfied: true, extra: "ignored" }],
    });
    expect(JSON.parse(sections.checklist)).toEqual([
      { id: "a", label: "A", satisfied: true },
    ]);
  });

  it("reports an item as unsatisfied unless it is exactly true", () => {
    const sections = generatePromptSections({
      checklist: [
        { id: "a", label: "A" },
        { id: "b", label: "B", satisfied: "yes" },
      ],
    });
    expect(JSON.parse(sections.checklist).map((item) => item.satisfied)).toEqual([
      false,
      false,
    ]);
  });

  it("does not change the checklist it is given", () => {
    const checklist = CHECKLIST.map((item) => ({ ...item }));
    generatePromptSections({ checklist });
    expect(checklist).toEqual(CHECKLIST);
  });

  it("leaves the CHECKLIST section out of the prompt when there is no checklist", () => {
    expect(generatePrompt()).not.toContain("## CHECKLIST");
    expect(generatePrompt({ checklist: [] })).not.toContain("## CHECKLIST");
  });

  it("puts the CHECKLIST section with the checklist JSON in the prompt when one exists", () => {
    const prompt = generatePrompt({ phase: "context", checklist: CHECKLIST });
    const section = prompt.slice(
      prompt.indexOf("## CHECKLIST"),
      prompt.indexOf("## CURRENT UI STATE")
    );

    expect(prompt).toContain("## CHECKLIST");
    expect(section).toContain(generatePromptSections({ checklist: CHECKLIST }).checklist);
    expect(section).toContain("checklist_updates");
  });

  it("places the CHECKLIST section after the conversation and before the UI state", () => {
    const prompt = generatePrompt({ phase: "context", checklist: CHECKLIST });
    const conversationIndex = prompt.indexOf("## CONVERSATION SO FAR");
    const checklistIndex = prompt.indexOf("## CHECKLIST");
    const uiStateIndex = prompt.indexOf("## CURRENT UI STATE");

    expect(checklistIndex).toBeGreaterThan(conversationIndex);
    expect(uiStateIndex).toBeGreaterThan(checklistIndex);
  });

  it("keeps the other sections in order when a checklist is present", () => {
    const prompt = generatePrompt({ phase: "context", checklist: CHECKLIST });
    const headings = [
      "## INSTRUCTION",
      "## CONTEXT",
      "## CONVERSATION SO FAR",
      "## CHECKLIST",
      "## CURRENT UI STATE",
      "## AVAILABLE COMPONENTS",
      "## RESPONSE SCHEMA",
    ];

    let lastIndex = -1;
    for (const heading of headings) {
      const index = prompt.indexOf(heading);
      expect(index, `missing heading ${heading}`).toBeGreaterThan(lastIndex);
      lastIndex = index;
    }
  });

  it("lists the checklist and checklist_updates fields as optional", () => {
    const { responseSchema } = generatePromptSections();
    expect(responseSchema).toMatch(/- checklist \(optional, /);
    expect(responseSchema).toMatch(/- checklist_updates \(optional, /);
  });

  it("does not change the response schema when a checklist is present", () => {
    const without = generatePromptSections().responseSchema;
    const withChecklist = generatePromptSections({ checklist: CHECKLIST }).responseSchema;
    expect(withChecklist).toBe(without);
  });
});

describe("checklist instructions", () => {
  it("tells the AI in phase one to send a checklist when it completes the phase", () => {
    expect(BOUNDARIES_PHASE_INSTRUCTION).toContain("phase_complete");
    expect(BOUNDARIES_PHASE_INSTRUCTION).toMatch(/checklist/);
  });

  it("tells the AI in phase two to send checklist_updates for satisfied items", () => {
    expect(CONTEXT_PHASE_INSTRUCTION).toContain("checklist_updates");
    expect(CONTEXT_PHASE_INSTRUCTION).toMatch(/every checklist item is satisfied/);
  });

  it("puts the phase two checklist instruction in the generated prompt", () => {
    const prompt = generatePrompt({ phase: "context" });
    expect(prompt).toContain("checklist_updates");
  });

  it("uses the checklist wording only in the phase instruction, not the default", () => {
    expect(DEFAULT_INSTRUCTION).not.toMatch(/checklist/);
  });
});

describe("generatePrompt", () => {
  const input = {
    instruction: "Help the user plan a 7-day holiday.",
    context: SNAPSHOT,
    messages: [{ role: "user", content: "I want to plan a trip." }],
    uiState: { budget: 30000 },
  };

  it("contains every required section heading in order", () => {
    const prompt = generatePrompt(input);
    const headings = [
      "## INSTRUCTION",
      "## CONTEXT",
      "## CONVERSATION SO FAR",
      "## CURRENT UI STATE",
      "## AVAILABLE COMPONENTS",
      "## RESPONSE SCHEMA",
    ];

    let lastIndex = -1;
    for (const heading of headings) {
      const index = prompt.indexOf(heading);
      expect(index, `missing heading ${heading}`).toBeGreaterThan(lastIndex);
      lastIndex = index;
    }
  });

  it("embeds the content from each section", () => {
    const prompt = generatePrompt(input);

    expect(prompt).toContain("Help the user plan a 7-day holiday.");
    expect(prompt).toContain(buildContextPackage(SNAPSHOT));
    expect(prompt).toContain("User wants to plan a trip.");
    expect(prompt).toContain("User: I want to plan a trip.");
    expect(prompt).toContain('"budget": 30000');
    for (const type of COMPONENT_TYPES) {
      expect(prompt).toContain(`"${type}"`);
    }
  });

  it("introduces the context as the current context package", () => {
    const prompt = generatePrompt(input);
    const contextIndex = prompt.indexOf("## CONTEXT");
    const conversationIndex = prompt.indexOf("## CONVERSATION SO FAR");
    const contextSection = prompt.slice(contextIndex, conversationIndex);

    expect(contextSection).toMatch(/current context package/);
    expect(contextSection).toContain(buildContextPackage(SNAPSHOT));
    expect(contextSection).not.toContain('"decisions"');
  });

  it("places the context fingerprint inside the context section", () => {
    const prompt = generatePrompt({ ...input, contextFingerprint: "CTX-91BC42" });
    const contextSection = prompt.slice(
      prompt.indexOf("## CONTEXT"),
      prompt.indexOf("## CONVERSATION SO FAR")
    );

    expect(contextSection).toContain("Context fingerprint: CTX-91BC42");
    expect(contextSection).toContain("CONTEXT PACKAGE");
  });

  it("uses the default instruction when the custom instruction is blank", () => {
    const prompt = generatePrompt({ ...input, instruction: "   " });
    expect(prompt).toContain(DEFAULT_INSTRUCTION.trim());
  });

  it("does not show the AI Nexus's welcome message as something it said", () => {
    let messages = createConversation();
    messages = appendUserMessage(messages, "I want to plan a trip.");

    const prompt = generatePrompt({ ...input, messages });
    const conversationSection = prompt.slice(
      prompt.indexOf("## CONVERSATION SO FAR"),
      prompt.indexOf("## CURRENT UI STATE")
    );

    expect(conversationSection).toContain("User: I want to plan a trip.");
    expect(conversationSection).not.toContain(WELCOME_MESSAGE.content);
    expect(prompt).not.toContain(`Assistant: ${WELCOME_MESSAGE.content}`);
  });

  it("ends by asking for the JSON object only", () => {
    const prompt = generatePrompt(input);
    expect(prompt.trimEnd().endsWith("Respond now with the JSON object only.")).toBe(true);
  });

  it("works with no input at all", () => {
    const prompt = generatePrompt();
    expect(prompt).toContain("## INSTRUCTION");
    expect(prompt).toContain(DEFAULT_INSTRUCTION.trim());
    expect(prompt).toContain("## RESPONSE SCHEMA");
  });

  it("includes the context fingerprint when provided", () => {
    const prompt = generatePrompt({ ...input, contextFingerprint: "CTX-91BC42" });
    expect(prompt).toContain("Context fingerprint: CTX-91BC42");
  });

  it("includes the field list from the protocol definition", () => {
    const prompt = generatePrompt(input);
    const { responseSchema } = generatePromptSections(input);

    expect(prompt).toContain(responseSchema);
    for (const field of RESPONSE_FIELDS) {
      expect(prompt).toContain(`- ${field.name} (required, ${field.type}): ${field.description}`);
    }
  });

  it("places the field list inside the response schema section, before the rules", () => {
    const prompt = generatePrompt(input);
    const section = prompt.slice(prompt.indexOf("## RESPONSE SCHEMA"));

    const fieldsIndex = section.indexOf("Fields:");
    const rulesIndex = section.indexOf("Rules:");
    expect(fieldsIndex).toBeGreaterThan(-1);
    expect(rulesIndex).toBeGreaterThan(fieldsIndex);

    for (const field of RESPONSE_FIELDS) {
      const index = section.indexOf(`- ${field.name} (`);
      expect(index, `missing field ${field.name}`).toBeGreaterThan(fieldsIndex);
      expect(index).toBeLessThan(rulesIndex);
    }
  });

  it("keeps the field list out of the other sections", () => {
    const prompt = generatePrompt(input);
    const beforeSchema = prompt.slice(0, prompt.indexOf("## RESPONSE SCHEMA"));

    expect(beforeSchema).not.toContain("Fields:");
    for (const field of RESPONSE_FIELDS) {
      expect(beforeSchema).not.toContain(`- ${field.name} (required`);
    }
  });

  it("includes the field list even when no input is given", () => {
    const prompt = generatePrompt();
    for (const field of RESPONSE_FIELDS) {
      expect(prompt).toContain(`- ${field.name} (required, `);
    }
  });
});