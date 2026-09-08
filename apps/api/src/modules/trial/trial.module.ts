import { Module } from '@nestjs/common';
import { TrialService } from './trial.service.js';

@Module({
  providers: [TrialService],
  exports: [TrialService],
})
export class TrialModule {}
