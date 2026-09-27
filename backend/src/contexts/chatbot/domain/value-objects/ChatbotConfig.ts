/** Canal oficial de atencion, dato de `config/chatbot-official-channel.json`. */
export interface OfficialChannel {
  readonly name: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly url: string | null;
}

export interface OutOfScopeTopic {
  readonly id: string;
  readonly label: string;
  readonly keywords: readonly string[];
}

/** Alcance excluido, dato de `config/chatbot-out-of-scope.json`. */
export interface OutOfScopePolicyConfig {
  readonly institutionalApp: string;
  readonly topics: readonly OutOfScopeTopic[];
}
