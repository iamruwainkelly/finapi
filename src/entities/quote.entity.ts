import { Entity, Column, PrimaryGeneratedColumn, BeforeInsert } from 'typeorm';

@Entity()
export class Quote {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  symbol: string;

  // store json
  @Column({ type: 'json', nullable: true })
  json: any;

  @Column({ nullable: true })
  created: number;

  // store the string date in ISO format
  @Column({ nullable: true })
  createdString: string;

  // upatedAt is automatically managed by TypeORM
  @Column({ nullable: true })
  updated: number;

  @Column({ nullable: true })
  updatedString: string;
}
