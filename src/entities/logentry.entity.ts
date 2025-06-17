import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class LogEntry {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  level: string;

  @Column()
  message: string;

  @Column({ nullable: true })
  context: string;

  @Column({ default: () => new Date().getTime() })
  created: number;
}
