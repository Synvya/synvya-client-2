import Ajv, { type AnySchema, type ErrorObject, type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import kind0Schema from "@nostrability/schemata/dist/nips/nip-01/kind-0/schema.json";
import kind1Schema from "@nostrability/schemata/dist/nips/nip-01/kind-1/schema.json";
import noteSchema from "@nostrability/schemata/dist/@/note.json";

type KnownSchema = {
  kind: number;
  schema: unknown;
};

export type ValidatableEvent = {
  id: string;
  pubkey: string;
  sig: string;
  kind: number;
  created_at: number;
  content: string;
  tags: string[][];
};

const ajv = new Ajv({
  allErrors: true,
  strict: false
});

addFormats(ajv);

const kind30402Schema: Record<string, unknown> = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "kind30402",
  description: "Classified Listing (NIP-99). Addressable event describing a listing with structured metadata in tags.",
  allOf: [
    noteSchema,
    {
      type: "object",
      properties: {
        kind: { const: 30402 },
        tags: {
          type: "array",
          items: {
            allOf: [
              {
                if: {
                  type: "array",
                  items: [{ const: "title" }]
                },
                then: {
                  type: "array",
                  minItems: 2,
                  maxItems: 2,
                  items: [{ const: "title" }, { type: "string", minLength: 1 }]
                }
              },
              {
                if: {
                  type: "array",
                  items: [{ const: "summary" }]
                },
                then: {
                  type: "array",
                  minItems: 2,
                  maxItems: 2,
                  items: [{ const: "summary" }, { type: "string", minLength: 1 }]
                }
              },
              {
                if: {
                  type: "array",
                  items: [{ const: "published_at" }]
                },
                then: {
                  type: "array",
                  minItems: 2,
                  maxItems: 2,
                  items: [{ const: "published_at" }, { type: "string", pattern: "^[0-9]+$" }]
                }
              },
              {
                if: {
                  type: "array",
                  items: [{ const: "location" }]
                },
                then: {
                  type: "array",
                  minItems: 2,
                  maxItems: 2,
                  items: [{ const: "location" }, { type: "string", minLength: 1 }]
                }
              },
              {
                if: {
                  type: "array",
                  items: [{ const: "status" }]
                },
                then: {
                  type: "array",
                  minItems: 2,
                  maxItems: 2,
                  items: [{ const: "status" }, { type: "string", enum: ["active", "sold"] }]
                }
              },
              {
                if: {
                  type: "array",
                  items: [{ const: "price" }]
                },
                then: {
                  type: "array",
                  minItems: 3,
                  maxItems: 4,
                  items: [
                    { const: "price" },
                    { type: "string", pattern: "^\\d+(?:\\.\\d+)?$" },
                    { type: "string", pattern: "^[A-Za-z]{3,6}$" },
                    { type: "string", pattern: "^[A-Za-z]{3,}$" }
                  ]
                }
              },
              {
                if: {
                  type: "array",
                  items: [{ const: "g" }]
                },
                then: {
                  type: "array",
                  minItems: 2,
                  maxItems: 2,
                  items: [{ const: "g" }, { type: "string", pattern: "^[0-9bcdefghjkmnpqrstuvwxyz]+$" }]
                }
              }
            ]
          }
        }
      }
    }
  ]
} as const;

const schemas: KnownSchema[] = [
  {
    kind: 0,
    schema: kind0Schema as unknown
  },
  {
    kind: 1,
    schema: kind1Schema as unknown
  },
  {
    kind: 30402,
    schema: kind30402Schema
  }
];

const validators = new Map<number, ValidateFunction<ValidatableEvent>>();

for (const { kind, schema } of schemas) {
  validators.set(kind, ajv.compile<ValidatableEvent>(schema as AnySchema));
}

function formatErrors(errors: ErrorObject[] | null | undefined): string {
  if (!errors?.length) {
    return "unknown validation error";
  }
  return errors
    .map((error) => {
      if (error.message) {
        return `${error.instancePath || "<root>"} ${error.message}`;
      }
      return `${error.instancePath || "<root>"} failed schema constraint`;
    })
    .join("\n");
}

export function validateEvent(event: ValidatableEvent): void {
  const eventKind = (event as { kind: number }).kind;
  const validator = validators.get(eventKind);
  if (!validator) {
    return;
  }
  const valid = validator(event);
  if (!valid) {
    throw new Error(`Nostr event validation failed for kind ${eventKind}: ${formatErrors(validator.errors)}`);
  }
}
