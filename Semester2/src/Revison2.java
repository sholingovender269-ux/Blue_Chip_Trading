import javax.swing.*;
import java.awt.*;
import java.awt.event.*;


public class Revison2 extends JFrame {
    JLabel name;
    JTextField nameText;
    JLabel department;
    JComboBox coursesBox;

    JLabel studyMode;
    JRadioButton fullTime;
    JRadioButton partTime;
    JButton button;

    public Revison2(){
        JPanel panel = new JPanel();
        panel.setLayout(new GridLayout(5,2,10,10));

        name = new JLabel("Enter in your name");
        nameText = new JTextField(20);
        panel.add(name);
        panel.add(nameText);

        department = new JLabel("Enter in your course");

        String[] courses = {"IT","BM","Hr"};
        coursesBox = new JComboBox(courses);

        panel.add(department);
        panel.add(coursesBox);


        studyMode = new JLabel("Select study mode");
        fullTime = new JRadioButton("Full Time");
        partTime = new JRadioButton("Part Time");

        fullTime.setSelected(true);


        ButtonGroup mode = new ButtonGroup();
        mode.add(fullTime);
        mode.add(partTime);

        panel.add(studyMode);

        panel.add(fullTime);
        panel.add(new JLabel(""));
        panel.add(partTime);

        button = new JButton("Register");
        panel.add(button);

        button.addActionListener(new ActionListener() {
            @Override
            public void actionPerformed(ActionEvent e) {

                String name = nameText.getText();
                String departments =(String) coursesBox.getSelectedItem();
                String mode;
                if(fullTime.isSelected()){
                  mode="Full Time";
                }else{
                    mode="Part Time";
                }
                JOptionPane.showMessageDialog(Revison2.this,
                        "Name: " + name+
                                "\nDepartment : "+ departments +
                                "\nMode : "+ mode
                        );

            }

        });




        add(panel);
        setTitle("Information");
        setSize(420,420);
        setDefaultCloseOperation(EXIT_ON_CLOSE);
      //  setLocationRelativeTo(null);
        setVisible(true);
    }

    public static void main(String[] args){
        new Revison2();
    }

}
