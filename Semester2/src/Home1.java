import javax.swing.*;
import java.awt.*;
import java.awt.event.ActionEvent;
import java.awt.event.ActionListener;

public class Home1 {

    public static void main(String[] args) {

        // TOP PANEL
        JPanel panel = new JPanel();
        panel.setBackground(Color.DARK_GRAY);
        panel.setPreferredSize(new Dimension(500, 100));
        panel.setLayout(new BorderLayout());

        // LABEL
        JLabel label = new JLabel("Howzit Welcome to my frame");
        label.setForeground(Color.WHITE);
        label.setFont(new Font("Arial", Font.BOLD, 20));

        panel.add(label, BorderLayout.NORTH);


        // BOTTOM PANEL
        JPanel panel2 = new JPanel();
        panel2.setBackground(Color.BLACK);
        panel2.setPreferredSize(new Dimension(500,100));
        panel2.setLayout(new FlowLayout(FlowLayout.CENTER));

        // BUTTON
        JButton button = new JButton("Press me");
        button.setVisible(true);
        button.setBackground(Color.CYAN);

        button.addActionListener(new ActionListener() {
            @Override
            public void actionPerformed(ActionEvent e) {
                System.out.println("Whats good man");
            }
        });

        panel2.add(button);

        // Third panel

        JPanel panel3 =new JPanel();
        panel3.setBackground(Color.magenta);
        panel3.setPreferredSize(new Dimension(500,100));
        panel3.setLayout(new BorderLayout());



        JLabel label2 = new JLabel();
        label2.setText("Terms and conditions");
        label2.setForeground(Color.black);


        panel3.add(label2,BorderLayout.SOUTH);


        // FRAME
        JFrame frame = new JFrame();
        frame.setTitle("My First Frame");
        frame.setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        frame.setSize(500, 500);

        frame.setLayout(new BorderLayout());

        frame.add(panel, BorderLayout.NORTH);
        frame.add(panel2, BorderLayout.CENTER);
        frame.add(panel3, BorderLayout.SOUTH);


        frame.setVisible(true);
    }
}