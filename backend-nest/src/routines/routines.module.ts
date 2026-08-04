import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogModule } from '../catalog/catalog.module';
import { ActionItem } from '../entities/action-item.entity';
import { Brand } from '../entities/brand.entity';
import { GateReview } from '../entities/gate-review.entity';
import { HealthScore } from '../entities/health-score.entity';
import { RoutinesController } from './routines.controller';

/**
 * Module des routines de pilotage périodiques.
 * Fournit au contrôleur les dépôts nécessaires et le service catalogue partagé.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Brand, ActionItem, GateReview, HealthScore]),
    CatalogModule,
  ],
  controllers: [RoutinesController],
})
export class RoutinesModule {}
