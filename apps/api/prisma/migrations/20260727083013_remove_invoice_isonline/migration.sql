-- Drop the unused invoices.isOnline column. The Online/Offline (cash/credit)
-- toggle now drives only the immediate-payment behaviour at entry time; the
-- stored flag had no reader after stock deduction was made unconditional.
ALTER TABLE "invoices" DROP COLUMN "isOnline";
