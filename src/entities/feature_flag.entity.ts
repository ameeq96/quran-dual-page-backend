import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('feature_flags')
export class FeatureFlag {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  key!: string;

  @Column({ default: false })
  enabled!: boolean;
}
