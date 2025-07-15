import { Column, PrimaryGeneratedColumn } from 'typeorm';

export class DatabaseModel {
  @PrimaryGeneratedColumn()
  id?: number;

  @Column()
  created?: number;

  @Column({ nullable: true })
  createdString: string;

  @Column()
  updated?: number;

  @Column({ nullable: true })
  updatedString: string;
}
