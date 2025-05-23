import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class Index {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  symbol: string;

  // investingSymbol
  @Column({ nullable: true })
  investingSymbol: string;

  @Column({ nullable: true })
  investingUrlName: string;

  @CreateDateColumn({ default: () => Date.now() })
  created: number;

  @UpdateDateColumn({ default: () => Date.now() })
  updated: number;
}
