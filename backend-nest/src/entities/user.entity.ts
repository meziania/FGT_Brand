import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Représente un utilisateur applicatif autorisé à accéder à la Control Tower.
 * Contient son rôle métier, ses identifiants et son statut d'activation.
 */
@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  email!: string;

  @Column()
  full_name!: string;

  @Column()
  role!: string;

  @Column()
  hashed_password!: string;

  @Column({ default: true })
  is_active!: boolean;
}
