import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('editions')
export class Edition {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  key!: string;

  @Column()
  label!: string;

  @Column({ default: true })
  enabled!: boolean;
}
