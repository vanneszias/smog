/**
 * Task 6 (phase 6): the sponsorships CSV export (A-09). Everything
 * exported here is part of `@smog/admin/client` (`index.ts` re-exports
 * this file). The export is audited, so it refetches the admin queries
 * (the audit log, the dashboard's recent entries) when it settles.
 */
import { useMutation } from "@tanstack/react-query";
import type { SponsorshipsCsv } from "../schema";
import { useAdminRpc, useInvalidateAfterAdminWrite } from "./slice";

/**
 * The file to download from an export's answer: its server-made name
 * (`sponsorships-YYYY-MM-DD.csv`) and the CSV byte for byte, BOM included
 * (Excel reads it as UTF-8).
 */
export function sponsorshipsCsvFile(result: SponsorshipsCsv): File {
  return new File([new TextEncoder().encode(result.csv)], result.filename, {
    type: "text/csv;charset=utf-8",
  });
}

/**
 * `admin.export.sponsorshipsCsv` as a mutation (it writes an audit entry):
 * `mutateAsync({ status?, from?, to? })` answers `{ csv, filename, rows }`;
 * `sponsorshipRefusalOf` reads `tooMany` (narrow the date range).
 */
export function useAdminSponsorshipsExport() {
  const rpc = useAdminRpc();
  const invalidate = useInvalidateAfterAdminWrite();
  return useMutation(
    rpc.export.sponsorshipsCsv.mutationOptions({ onSettled: invalidate })
  );
}
