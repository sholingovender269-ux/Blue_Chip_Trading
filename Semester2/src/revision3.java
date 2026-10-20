import javax.swing.*;
import java.awt.*;
import java.awt.event.*;

public class revision3 extends JFrame{
    JLabel lblName;
    JTextField empName;

    JLabel lblDepartment;

    JComboBox depBox;

    JRadioButton permanent;
    JRadioButton contract;

    JButton submit;



    public revision3(){

        JPanel panel = new JPanel();
        panel.setLayout(new GridLayout(5,2,10,10));

        lblName = new JLabel("Enter in your name");
        empName= new JTextField(20);

        panel.add(lblName);
        panel.add(empName);

        lblDepartment = new JLabel("Enter in your department");
        String[] courses = {"IT","fIN","Mark"};

        depBox = new JComboBox(courses);

        panel.add(lblDepartment);
        panel.add(depBox);

        JLabel label = new JLabel("Department");
        permanent = new JRadioButton("Permanent");
        contract = new JRadioButton("Contract");

        ButtonGroup position = new ButtonGroup();
        position.add(permanent);
        position.add(contract);

        panel.add(label);
        panel.add(permanent);
        panel.add(new JLabel(" "));
        panel.add(contract);

        submit= new JButton("Submit");
        panel.add(submit);

        submit.addActionListener(new ActionListener(){
            @Override
            public void actionPerformed(ActionEvent e) {
                String name = empName.getText();
                String department =(String) depBox.getSelectedItem();

                String position;

                if(permanent.isSelected()) {
                 position="Permanent";
                }else{
                    position="Contract";
                }

                JOptionPane.showMessageDialog(revision3.this,
                       "name: "+ name+
                               "\nDepartment: "+ department+
                                "\nPosition: "+ position
                );
            }

         });
        add(panel);
        setSize(420,420);
        setDefaultCloseOperation(EXIT_ON_CLOSE);
        setVisible(true);


    }

    public static void main(String[] args){
        new revision3();
    }
}
