export function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Elemento obrigatório ausente: ${selector}`);
  return element;
}

export function requiredPayload<T>(payload: T | null, context: string): T {
  if (payload === null) throw new Error(`Resposta vazia ao ${context}.`);
  return payload;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Erro desconhecido";
}
