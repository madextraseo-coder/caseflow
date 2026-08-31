import type { PoolClient } from "pg";

export async function buildPacketManifest(client: PoolClient, matterId: string) {
  const sig = await client.query<{
    id: string;
    provider: string;
    provider_transaction_id: string | null;
    signed_document_storage_key: string | null;
    certificate_storage_key: string | null;
  }>(
    `SELECT id::text,provider,provider_transaction_id,signed_document_storage_key,certificate_storage_key
       FROM signature_requests
      WHERE matter_id=$1
        AND signed_at IS NOT NULL
        AND signed_document_storage_key IS NOT NULL
      ORDER BY signed_at DESC LIMIT 1`,
    [matterId]
  );
  if (!sig.rows[0]) throw new Error("Final firm packet cannot be built before the retainer is signed");

  const docs = await client.query<{
    id: string;
    category: string;
    original_filename: string;
    sha256: string;
    review_status: string;
    quarantine_status: string;
  }>(
    `SELECT id::text,category,original_filename,sha256,review_status,quarantine_status
       FROM documents
      WHERE matter_id=$1
      ORDER BY category,created_at`,
    [matterId]
  );
  const safeDocs = docs.rows.filter(
    (d) => d.quarantine_status === "RELEASED" && d.review_status === "APPROVED"
  );

  return [
    { section: "01 Executed Retainer", type: "SIGNATURE", ...sig.rows[0] },
    { section: "02 E-Sign Certificate", type: "SIGNATURE_CERTIFICATE", signatureRequestId: sig.rows[0].id },
    { section: "03 Intake Summary", type: "GENERATED" },
    { section: "04 Qualification", type: "GENERATED" },
    ...safeDocs.map((d) => ({
      section: `DOCUMENT ${d.category}`,
      type: "DOCUMENT",
      documentId: d.id,
      filename: d.original_filename,
      sha256: d.sha256
    })),
    { section: "Consent Evidence", type: "GENERATED" },
    { section: "Audit / QC Summary", type: "GENERATED" }
  ];
}
