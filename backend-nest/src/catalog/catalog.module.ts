import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Brand } from '../entities/brand.entity';
import { GateReview } from '../entities/gate-review.entity';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

/**
 * Module catalogue relié aux données FGT et aux entités de pilotage.
 * Exporte le service catalogue pour les marques et les routines.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Brand, GateReview])],
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
