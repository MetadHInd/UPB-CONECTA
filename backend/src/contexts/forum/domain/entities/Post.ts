/**
 * Publicacion del foro (HU-30). El autor es una copia de los datos del
 * directorio al momento de publicar (criterio 1): si luego el directorio
 * cambia, la publicacion conserva la firma con que se hizo. El correo se
 * guarda para trazabilidad (moderacion), pero no forma parte de la vista
 * publica.
 */
export interface PostAuthorSnapshot {
  readonly email: string;
  readonly name: string;
  readonly programName: string;
  readonly programId: string | null;
}

export interface Post {
  readonly id: string;
  readonly topicId: string;
  readonly author: PostAuthorSnapshot;
  readonly title: string;
  readonly text: string;
  readonly publishedAt: Date;
}

export const POST_LIMITS = { titleMax: 150, textMax: 5000 } as const;

export const ANONYMITY_NOT_ALLOWED_MESSAGE =
  'Las publicaciones se firman con tu nombre y programa del directorio institucional. No se admiten publicaciones anónimas ni bajo seudónimo.';

/**
 * Campos que un cliente podria enviar para firmar con otra identidad. El
 * servidor rechaza la peticion completa si aparece cualquiera (criterio 2):
 * la autoria solo sale de la sesion verificada.
 */
export const IDENTITY_FIELDS = [
  'author',
  'authorName',
  'authorEmail',
  'displayName',
  'name',
  'alias',
  'nickname',
  'pseudonym',
  'anonymous',
  'email',
  'program',
  'programId'
] as const;

export const CONTENT_FIELDS = ['title', 'text'] as const;

export interface PostBodyClassification {
  readonly identityFields: readonly string[];
  readonly unknownFields: readonly string[];
}

export function classifyPostBody(body: Readonly<Record<string, unknown>>): PostBodyClassification {
  const identity: readonly string[] = IDENTITY_FIELDS;
  const content: readonly string[] = CONTENT_FIELDS;
  const keys = Object.keys(body);
  return {
    identityFields: keys.filter((key) => identity.includes(key)),
    unknownFields: keys.filter((key) => !identity.includes(key) && !content.includes(key))
  };
}

export type PostContentValidation =
  | { readonly valid: true; readonly title: string; readonly text: string }
  | { readonly valid: false; readonly message: string };

export function validatePostContent(title: unknown, text: unknown): PostContentValidation {
  if (typeof title !== 'string' || typeof text !== 'string') {
    return { valid: false, message: 'El título y el texto son obligatorios.' };
  }
  const cleanTitle = title.trim();
  const cleanText = text.trim();
  if (cleanTitle === '' || cleanText === '') return { valid: false, message: 'El título y el texto no pueden estar vacíos.' };
  if (cleanTitle.length > POST_LIMITS.titleMax) {
    return { valid: false, message: `El título admite hasta ${POST_LIMITS.titleMax} caracteres.` };
  }
  if (cleanText.length > POST_LIMITS.textMax) {
    return { valid: false, message: `El texto admite hasta ${POST_LIMITS.textMax} caracteres.` };
  }
  return { valid: true, title: cleanTitle, text: cleanText };
}

/** Vista publica: nombre y programa del autor, nunca su correo. */
export interface PostView {
  readonly id: string;
  readonly topicId: string;
  readonly title: string;
  readonly text: string;
  readonly publishedAt: Date;
  readonly author: { readonly name: string; readonly program: string };
}

export function toPostView(post: Post): PostView {
  return {
    id: post.id,
    topicId: post.topicId,
    title: post.title,
    text: post.text,
    publishedAt: post.publishedAt,
    author: { name: post.author.name, program: post.author.programName }
  };
}
