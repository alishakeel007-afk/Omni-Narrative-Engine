# Supabase database CA

`prod-ca-2021.crt` is a public trust certificate, not a credential. It was downloaded over HTTPS from Supabase's distribution bucket:

https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt

`lib/prisma.ts` uses it by default only for Supabase database/pooler hosts. `SUPABASE_DB_CA_PATH` overrides the file for a different deployment. Certificate and hostname verification remain enabled. Next.js includes the certificate in traced deployment output.

See [Supabase SSL guidance](https://supabase.com/docs/guides/platform/ssl-enforcement). If the provider rotates its CA, obtain the replacement through its official database settings/distribution channel and recheck a verified database connection.
