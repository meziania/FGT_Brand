import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Représente la revue d'une gate de lancement pour une marque.
 * Conserve la décision, les commentaires et la checklist sérialisée associés au passage de gate.
 */
@Entity('gate_reviews')
export class GateReview {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  brand_id!: number;

  @Column()
  gate!: string;

  @Column({ default: 'PENDING' })
  decision!: string;

  @Column({ type: 'datetime', nullable: true })
  decided_at!: Date | null;

  @Column({ type: 'varchar', nullable: true })
  decided_by!: string | null;

  @Column({ type: 'text', nullable: true })
  comment!: string | null;

  @Column({ type: 'text', nullable: true })
  checklist_json!: string | null;

  /** Origine de la décision : `manual` (utilisateur) ou `sync` (import API auto). */
  @Column({ type: 'varchar', default: 'manual' })
  source!: string;
}
