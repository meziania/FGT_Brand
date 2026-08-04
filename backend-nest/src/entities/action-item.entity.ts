import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Représente une action opérationnelle liée à une marque.
 * Aligné sur le manuel §9 (owner, SLA, priorité, cause, preuve, escalade).
 */
@Entity('action_items')
export class ActionItem {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  brand_id!: number;

  @Column()
  code!: string;

  @Column()
  title!: string;

  @Column()
  owner_role!: string;

  @Column({ type: 'varchar', nullable: true })
  approver_role!: string | null;

  @Column({ default: 5 })
  sla_days!: number;

  @Column({ default: 'open' })
  status!: string;

  @Column({ type: 'date', nullable: true })
  due_date!: string | null;

  @Column({ type: 'varchar', nullable: true })
  deliverable!: string | null;

  @Column({ type: 'varchar', nullable: true })
  close_condition!: string | null;

  /** low | medium | high | critical */
  @Column({ default: 'medium' })
  priority!: string;

  /** gate | health | brand_review | stock_api | manual */
  @Column({ type: 'varchar', nullable: true })
  source!: string | null;

  @Column({ type: 'varchar', nullable: true })
  root_cause!: string | null;

  @Column({ type: 'varchar', nullable: true })
  expected_result!: string | null;

  @Column({ type: 'varchar', nullable: true })
  evidence!: string | null;

  /**
   * none | reminder | overdue | manager | direction — recalculé à la lecture.
   */
  @Column({ default: 'none' })
  escalation_level!: string;
}
