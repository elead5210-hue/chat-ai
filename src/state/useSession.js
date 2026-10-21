import { useCallback, useMemo, useRef, useState } from "react";
import {
  DEFAULT_INSTRUCTION,
  generateContinuationPrompt,
  generatePrompt,
  generatePromptSections,
} from "../prompt/generatePrompt.js";
import { validateResponse } from "../protocol/validateResponse.js";
import {
  applyContextUpdates,
  createSnapshot,
} from "../context/contextSnapshot.js";
import { buildContextPackage } from "../context/contextPackage.js";
import { computeContextFingerprint } from "../context/contextFingerprint.js";
import {
  appendMessage,
  appendUserMessage,
  createConversation,
  resetConversation,
} from "./conversationStore.js";
import {
  applyResponseToUiState,
  createUiState,
  resetUiState,
  setValue,
} from "./uiStateStore.js";
import { buildContinuationInput, buildPromptInput } from "./promptInput.js";

/**
 * Session hook. Keeps three separate stores and only combines them when the
 * prompt input is built:
 *   - conversation (messages)  -> ./conversationStore.js
 *   - context (Context Snapshot) -> ../context/contextSnapshot.js
 *   - UI state (form values)   -> ./uiStateStore.js
 */
export function useSession() {
  const [messages, setMessages] = useState(() => createConversation());
  const [context, setContext] = useState(() => createSnapshot());
  const [uiState, setUiState] = useState(() => createUiState());
  const [instruction, setInstruction] = useState(DEFAULT_INSTRUCTION);
  const [lastResponse, setLastResponse] = useState(null);
  const [validationErrors, setValidationErrors] = useState([]);
  const lastResponseRef = useRef(null);

  // The one place the three stores meet.
  const promptInput = useMemo(
    () => buildPromptInput({ instruction, messages, context, uiState }),
    [instruction, context, messages, uiState]
  );

  const prompt = useMemo(() => generatePrompt(promptInput), [promptInput]);
  const promptSections = useMemo(() => generatePromptSections(promptInput), [promptInput]);
  const contextPackage = useMemo(() => buildContextPackage(context), [context]);
  // Identifies this exact snapshot; recomputed only when the context changes.
  const contextFingerprint = useMemo(() => computeContextFingerprint(context), [context]);
  const contextVersion = context.context_version;
  const continuationPrompt = useMemo(
    () => generateContinuationPrompt(buildContinuationInput({ messages, context })),
    [context, messages]
  );

  const sendUserMessage = useCallback((text) => {
    setMessages((current) => appendUserMessage(current, text));
  }, []);

  const updateUiState = useCallback((id, value) => {
    setUiState((current) => setValue(current, id, value));
  }, []);

  const updateInstruction = useCallback((text) => {
    setInstruction(typeof text === "string" ? text : "");
  }, []);

  const resetInstruction = useCallback(() => {
    setInstruction(DEFAULT_INSTRUCTION);
  }, []);

  /**
   * Validate pasted AI output. On success the response is applied to each of
   * the three stores separately: the message goes to the conversation, the
   * context_updates to the context, and the components/state_updates to the
   * UI state. Returns true on success.
   */
  const submitResponse = useCallback(
    (rawText) => {
      const result = validateResponse(rawText);

      if (!result.ok) {
        setValidationErrors(result.errors);
        return false;
      }

      const response = result.value;
      const previousComponents = lastResponseRef.current?.components ?? [];
      lastResponseRef.current = response;
      setValidationErrors([]);
      setLastResponse(response);
      // Conversation store: what was said.
      setMessages((current) =>
        appendMessage(current, response.message.role, response.message.content)
      );
      // Context store: what currently matters.
      setContext((current) => applyContextUpdates(current, response.context_updates));
      // UI state store: what the user has entered into generated forms.
      setUiState((current) => applyResponseToUiState(current, previousComponents, response));
      return true;
    },
    []
  );

  const resetSession = useCallback(() => {
    setMessages(resetConversation());
    setContext(createSnapshot());
    setUiState(resetUiState());
    setInstruction(DEFAULT_INSTRUCTION);
    setLastResponse(null);
    lastResponseRef.current = null;
    setValidationErrors([]);
  }, []);

  return {
    messages,
    context,
    uiState,
    instruction,
    lastResponse,
    validationErrors,
    prompt,
    promptSections,
    contextPackage,
    contextFingerprint,
    contextVersion,
    continuationPrompt,
    sendUserMessage,
    updateUiState,
    updateInstruction,
    resetInstruction,
    submitResponse,
    resetSession,
  };
}