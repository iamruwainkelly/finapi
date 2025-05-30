import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  BeforeInsert,
  BeforeUpdate,
} from 'typeorm';

@Entity('cron')
export class Cron {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  // description of the cron job
  @Column({ nullable: true })
  description: string;

  // cron method name
  @Column({ nullable: true })
  method: string;

  @Column({ nullable: true })
  lastRun: number;

  @Column({ nullable: true })
  lastRunAt: string;

  // interval in minutes
  @Column({ nullable: true })
  interval: number;

  // enabled status
  @Column({ default: true })
  enabled: boolean;

  // before update hook to set lastRunAt
  @BeforeUpdate()
  setLastRunAt() {
    if (this.lastRun && !this.lastRunAt) {
      this.lastRunAt = new Date(this.lastRun).toISOString();
    }
  }
}
