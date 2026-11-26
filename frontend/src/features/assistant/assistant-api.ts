import { apiClient } from '../../lib/api/api-client';

export interface AssistantAnswer {
  answer: string;
  sources: { id: string; title: string; reference: string }[];
  followUps: string[];
  navigation: { label: string; route: string }[];
  responseMode: 'local' | 'generated';
  knowledgeId: string | null;
  warning: string | null;
  model: string | null;
}

export function askAssistant(question: string, page: string, language: 'en' | 'hi',
  mode: 'simple' | 'technical', previousKnowledgeId: string | null, requiresAuth: boolean,
  signal?: AbortSignal): Promise<AssistantAnswer> {
  return apiClient<AssistantAnswer>('/api/assistant/chat', {
    method: 'POST', body: { question, page, language, mode, previousKnowledgeId },
    requiresAuth, signal,
  });
}

export function explainWithCivicAssist(question: string): void {
  window.dispatchEvent(new CustomEvent('civicassist:explain', { detail: question }));
}
