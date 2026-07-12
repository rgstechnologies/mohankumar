import { Global, Module } from '@nestjs/common';
import { FeatureGuard } from './feature.guard';
import { LicensingService } from './licensing.service';

@Global()
@Module({
  providers: [LicensingService, FeatureGuard],
  exports: [LicensingService, FeatureGuard],
})
export class LicensingModule {}
